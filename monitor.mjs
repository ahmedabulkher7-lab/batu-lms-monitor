import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, '.env');
const COOKIES_PATH = path.join(__dirname, 'cookies.json');
const STATE_PATH = path.join(__dirname, 'state.json');
const BASE_URL = 'https://batechu.com';

// 1. Load .env file
function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnv();

const COURSES_DIR = process.env.COURSES_DIR
  ? path.resolve(__dirname, process.env.COURSES_DIR)
  : path.join(__dirname, 'courses');

// Helper: sanitize Windows folder/file names
function sanitizeName(name) {
  return String(name || 'Untitled')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '')
    .trim();
}

function padIndex(idx) {
  return String(idx).padStart(2, '0');
}

// 2. Simple Cookie Jar with persistence
class CookieJar {
  constructor(filePath) {
    this.filePath = filePath;
    this.cookies = {};
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        this.cookies = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      }
    } catch {
      this.cookies = {};
    }
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.cookies, null, 2), 'utf8');
    } catch {
      // Ignore write errors
    }
  }

  updateFromResponse(res) {
    const setCookies =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : res.headers.get('set-cookie')
          ? [res.headers.get('set-cookie')]
          : [];

    for (const sc of setCookies) {
      const firstPart = sc.split(';')[0];
      const eqIdx = firstPart.indexOf('=');
      if (eqIdx > 0) {
        const name = firstPart.slice(0, eqIdx).trim();
        const value = firstPart.slice(eqIdx + 1).trim();
        if (value === 'deleted' || value === '') {
          delete this.cookies[name];
        } else {
          this.cookies[name] = value;
        }
      }
    }
    this.save();
  }

  getHeader() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  getXsrfToken() {
    return this.cookies['XSRF-TOKEN']
      ? decodeURIComponent(this.cookies['XSRF-TOKEN'])
      : '';
  }

  clear() {
    this.cookies = {};
    this.save();
  }
}

// 3. HTTP + Inertia + File Download Helper
class BatuClient {
  constructor() {
    this.jar = new CookieJar(COOKIES_PATH);
  }

  async request(urlOrPath, options = {}, maxRedirects = 6) {
    const url = urlOrPath.startsWith('http')
      ? urlOrPath
      : `${BASE_URL}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`;

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
      'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
      ...(options.headers || {}),
    };

    const cookieHeader = this.jar.getHeader();
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    const xsrf = this.jar.getXsrfToken();
    if (xsrf && !headers['X-XSRF-TOKEN']) {
      headers['X-XSRF-TOKEN'] = xsrf;
    }

    const res = await fetch(url, {
      ...options,
      headers,
      redirect: 'manual',
    });

    this.jar.updateFromResponse(res);

    if ([301, 302, 303, 307, 308].includes(res.status) && maxRedirects > 0) {
      const location = res.headers.get('location');
      if (location) {
        const nextUrl = new URL(location, url).toString();
        return this.request(
          nextUrl,
          {
            method: 'GET',
            headers: { Referer: url },
          },
          maxRedirects - 1
        );
      }
    }

    const text = await res.text();
    const page = this.extractInertiaPage(text);
    const csrfMatch = text.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i);
    const csrfToken = csrfMatch ? csrfMatch[1] : page?.props?.csrf_token || '';

    return {
      status: res.status,
      url,
      text,
      page,
      csrfToken,
    };
  }

  async downloadFile(fileUrl, destPath) {
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    };
    if (fileUrl.includes('batechu.com')) {
      const cookieHeader = this.jar.getHeader();
      if (cookieHeader) headers['Cookie'] = cookieHeader;
    }

    const res = await fetch(fileUrl, { headers, redirect: 'follow' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} while downloading ${fileUrl}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buffer);
    return buffer.length;
  }

  extractInertiaPage(html) {
    const match = html.match(/data-page="([^"]+)"/);
    if (!match) {
      try {
        const parsed = JSON.parse(html);
        if (parsed && parsed.component && parsed.props) return parsed;
      } catch {
        return null;
      }
      return null;
    }
    try {
      const decoded = match[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#039;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  async ensureAuthenticated(academicId, password) {
    const check = await this.request('/lms/courses');
    if (
      check.page &&
      check.page.component !== 'Student/login' &&
      check.page.props?.auth?.user
    ) {
      return check.page.props.auth.user;
    }

    this.jar.clear();
    const loginPage = await this.request('/lms/login');
    const csrfToken = loginPage.csrfToken;
    const email = academicId.includes('@')
      ? academicId.trim()
      : `${academicId.trim()}@batechu.com`;

    const loginRes = await this.request('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: BASE_URL,
        Referer: `${BASE_URL}/lms/login`,
        ...(csrfToken ? { 'X-CSRF-TOKEN': csrfToken } : {}),
      },
      body: JSON.stringify({
        email,
        password,
        remember: true,
      }),
    });

    if (loginRes.page?.component === 'Student/login') {
      const errMsg =
        loginRes.page?.props?.errors?.email ||
        loginRes.page?.props?.errors?.password ||
        'فشل تسجيل الدخول. تأكد من صحة الرقم الأكاديمي وكلمة المرور في ملف .env';
      throw new Error(errMsg);
    }

    const verify = await this.request('/lms/dashboard');
    if (!verify.page || verify.page.component === 'Student/login') {
      throw new Error(
        'لم نتمكن من تأكيد جلسة الدخول إلى المنصة. تأكد من بيانات حسابك في ملف .env'
      );
    }

    return verify.page.props?.auth?.user || { email };
  }
}

// 4. Fetch All Student LMS Data & Sync Files to Disk in Exact Order
async function collectAndSyncLmsData(client, options = { downloadFiles: true }) {
  const snapshot = {
    fetchedAt: new Date().toISOString(),
    student: null,
    courses: [],
    quizzes: [],
    exams: [],
    assignments: [],
    announcements: [],
    materials: [],
    notifications: [],
  };

  const syncStats = {
    totalFilesOnLms: 0,
    alreadyDownloaded: 0,
    newlyDownloaded: [],
    failedDownloads: [],
  };

  // A. Dashboard
  const dashRes = await client.request('/lms/dashboard');
  if (dashRes.page?.props) {
    snapshot.student = dashRes.page.props.auth?.user || null;
  }

  // B. Courses & Each Course's Weeks + Materials + Quizzes
  const coursesRes = await client.request('/lms/courses');
  const rawCourses = Array.isArray(coursesRes.page?.props?.courses)
    ? coursesRes.page.props.courses
    : Object.values(coursesRes.page?.props?.courses || {});

  if (options.downloadFiles) {
    fs.mkdirSync(COURSES_DIR, { recursive: true });
  }

  for (let cIdx = 0; cIdx < rawCourses.length; cIdx++) {
    const c = rawCourses[cIdx];
    if (!c || !c.slug) continue;

    const courseOrder = padIndex(cIdx + 1);
    const courseFolderName = `${courseOrder} - ${sanitizeName(c.name)}`;
    const courseDirPath = path.join(COURSES_DIR, courseFolderName);

    if (options.downloadFiles) {
      fs.mkdirSync(courseDirPath, { recursive: true });
    }

    snapshot.courses.push({
      id: c.id,
      order: cIdx + 1,
      name: c.name,
      slug: c.slug,
      localFolder: courseFolderName,
    });

    const weeksRes = await client.request(`/lms/courses/${c.slug}/weeks`);
    const weeksProps = weeksRes.page?.props || {};

    // Course-specific announcements
    const courseAnnouncements = weeksProps.announcements || [];
    for (const ann of courseAnnouncements) {
      snapshot.announcements.push({
        id: `ann-${c.slug}-${ann.id}`,
        courseName: c.name,
        by: ann.by || 'هيئة التدريس',
        title: ann.title || '',
        body: ann.body || ann.content || '',
        level: ann.level || 'info',
        createdAt: ann.created_at || null,
      });
    }

    if (options.downloadFiles && courseAnnouncements.length > 0) {
      const annLines = [
        `# إعلانات وتنبيهات مقرر: ${c.name}`,
        '',
        ...courseAnnouncements.map(
          (a, i) =>
            `## ${i + 1}. ${a.title || 'تنبيه'} (${a.by || 'هيئة التدريس'})\n- التاريخ: ${a.created_at || ''}\n\n${a.body || a.content || ''}\n`
        ),
      ];
      fs.writeFileSync(
        path.join(courseDirPath, '00 - Announcements (إعلانات المادة).md'),
        annLines.join('\n'),
        'utf8'
      );
    }

    // Course-specific online exams shown on the weeks page
    for (const ex of weeksProps.exams || []) {
      snapshot.exams.push({
        id: ex.uuid || `${c.slug}-${ex.id || ex.title}`,
        uuid: ex.uuid || null,
        title: ex.title,
        courseName: ex.course || c.name,
        open: !!ex.open,
        upcoming: !!ex.upcoming,
        ended: !!ex.ended,
        paper: !!ex.paper,
        questions: ex.questions ?? null,
        durationMinutes: ex.duration_minutes ?? null,
        startTime: ex.start_time || null,
        endTime: ex.end_time || null,
        score: ex.score ?? null,
        rawScore: ex.raw_score ?? null,
        marksOutOf: ex.marks_out_of ?? null,
        url: `${BASE_URL}/lms/exams`,
      });
    }

    // Weeks -> Materials & Quizzes (fetched concurrently per course)
    const validWeeks = (weeksProps.weeks || []).filter((w) => w && w.slug);
    const weekResults = await Promise.all(
      validWeeks.map(async (w, wIdx) => {
        const matRes = await client.request(`/lms/courses/weeks/${w.slug}/materials`);
        return { w, wIdx, matRes };
      })
    );

    for (const { w, wIdx, matRes } of weekResults) {
      const weekOrder = padIndex(wIdx + 1);
      const weekFolderName = `${weekOrder} - ${sanitizeName(w.name)}`;
      const weekDirPath = path.join(courseDirPath, weekFolderName);

      const weekObj = matRes.page?.props?.week || w;
      const items = weekObj.materials || matRes.page?.props?.items || [];

      if (options.downloadFiles && items.length > 0) {
        fs.mkdirSync(weekDirPath, { recursive: true });
      }

      for (let mIdx = 0; mIdx < items.length; mIdx++) {
        const item = items[mIdx];
        const matOrder = padIndex(mIdx + 1);
        const itemUrl =
          item.type === 'quiz' && item.uuid
            ? `${BASE_URL}/lms/quizzes/${item.uuid}/solve`
            : `${BASE_URL}/lms/courses/weeks/${w.slug}/materials`;

        let localFilePath = null;

        // Download file or save shortcut in exact week order
        if (options.downloadFiles) {
          if (item.file) {
            syncStats.totalFilesOnLms++;
            let ext = '.pdf';
            try {
              const parsedExt = path.extname(new URL(item.file).pathname);
              if (parsedExt) ext = parsedExt;
            } catch {
              ext = '.pdf';
            }

            const typePrefix =
              item.type === 'assignment'
                ? '[Assignment] '
                : item.type === 'revision'
                  ? '[Revision] '
                  : '';
            const safeItemName = sanitizeName(item.name);
            const fileName = safeItemName.toLowerCase().endsWith(ext.toLowerCase())
              ? `${matOrder} - ${typePrefix}${safeItemName}`
              : `${matOrder} - ${typePrefix}${safeItemName}${ext}`;

            const fullDestPath = path.join(weekDirPath, fileName);
            localFilePath = path.relative(__dirname, fullDestPath);

            if (fs.existsSync(fullDestPath) && fs.statSync(fullDestPath).size > 0) {
              syncStats.alreadyDownloaded++;
            } else {
              try {
                await client.downloadFile(item.file, fullDestPath);
                syncStats.newlyDownloaded.push({
                  courseName: c.name,
                  weekName: w.name,
                  name: item.name,
                  fileName,
                  relativePath: localFilePath,
                });
              } catch (err) {
                syncStats.failedDownloads.push({
                  courseName: c.name,
                  weekName: w.name,
                  name: item.name,
                  error: err.message,
                });
              }
            }
          } else if (item.url_link || item.video_link) {
            const targetUrl = item.url_link || item.video_link;
            const shortcutName = `${matOrder} - [Link] ${sanitizeName(item.name)}.url`;
            const fullShortcutPath = path.join(weekDirPath, shortcutName);
            localFilePath = path.relative(__dirname, fullShortcutPath);
            if (!fs.existsSync(fullShortcutPath)) {
              fs.mkdirSync(weekDirPath, { recursive: true });
              fs.writeFileSync(
                fullShortcutPath,
                `[InternetShortcut]\r\nURL=${targetUrl}\r\n`,
                'utf8'
              );
            }
          }
        }

        if (item.type === 'quiz') {
          const questionsCount =
            item.quiz_questions_count ??
            (Array.isArray(item.quiz_questions) ? item.quiz_questions.length : 0);
          const hasSubmitted =
            !!item.has_submitted ||
            (Array.isArray(item.quiz_responses) && item.quiz_responses.length > 0);

          snapshot.quizzes.push({
            id: item.uuid || `quiz-${item.id}`,
            uuid: item.uuid || null,
            materialId: item.id,
            name: item.name,
            description: item.description || '',
            courseName: c.name,
            weekName: w.name,
            status: item.status || 'published',
            questionsCount,
            hasSubmitted,
            createdAt: item.created_at || null,
            url: itemUrl,
          });
        } else {
          snapshot.materials.push({
            id: `mat-${item.id}`,
            name: item.name,
            type: item.type,
            courseName: c.name,
            weekName: w.name,
            fileUrl: item.file || item.url_link || item.video_link || null,
            localPath: localFilePath,
            deadline: item.deadline || null,
            expired: !!item.expired,
            hasSubmitted: !!item.has_submitted,
            createdAt: item.created_at || null,
            url: itemUrl,
          });
        }
      }
    }
  }

  // C. Online Exams page (/lms/exams)
  const examsRes = await client.request('/lms/exams');
  const examsList = examsRes.page?.props?.exams || [];
  const seenExamIds = new Set(snapshot.exams.map((e) => e.id));
  for (const ex of examsList) {
    const exId = ex.uuid || `${ex.course}-${ex.title}`;
    if (seenExamIds.has(exId)) continue;
    seenExamIds.add(exId);
    snapshot.exams.push({
      id: exId,
      uuid: ex.uuid || null,
      title: ex.title,
      courseName: ex.course || '',
      open: !!ex.open,
      upcoming: !!ex.upcoming,
      ended: !!ex.ended,
      paper: !!ex.paper,
      questions: ex.questions ?? null,
      durationMinutes: ex.duration_minutes ?? null,
      startTime: ex.start_time || null,
      endTime: ex.end_time || null,
      score: ex.score ?? null,
      rawScore: ex.raw_score ?? null,
      marksOutOf: ex.marks_out_of ?? null,
      url: `${BASE_URL}/lms/exams`,
    });
  }

  // D. Assignments page (/lms/assignments)
  const assignRes = await client.request('/lms/assignments');
  const assignCourses = assignRes.page?.props?.courses || [];
  for (const ac of assignCourses) {
    for (const a of ac.assignments || []) {
      const hasSubmitted =
        !!a.has_submitted ||
        (Array.isArray(a.assignments) && a.assignments.length > 0);
      snapshot.assignments.push({
        id: `assign-${a.id}`,
        name: a.name,
        courseName: ac.name,
        deadline: a.deadline || null,
        expired: !!a.expired,
        hasSubmitted,
        url: a.week?.slug
          ? `${BASE_URL}/lms/courses/weeks/${a.week.slug}/materials`
          : `${BASE_URL}/lms/assignments`,
      });
    }
  }

  // E. Notifications page (/lms/notifications)
  const notifRes = await client.request('/lms/notifications');
  const notifItems = notifRes.page?.props?.notifications?.data || [];
  for (const n of notifItems) {
    snapshot.notifications.push({
      id: `notif-${n.id}`,
      title: n.title || n.data?.title || 'إشعار جديد',
      body: n.body || n.message || n.data?.body || n.data?.message || '',
      createdAt: n.created_at || null,
      readAt: n.read_at || null,
    });
  }

  return { snapshot, syncStats };
}

// 5. Compare with Previous State
function diffSnapshots(prev, curr, syncStats) {
  if (!prev) {
    return {
      isFirstRun: true,
      hasChanges: true,
      newQuizzes: [],
      newOrOpenedExams: [],
      newAssignments: [],
      newMaterials: [],
      newAnnouncements: [],
      newNotifications: [],
      newlyDownloaded: syncStats?.newlyDownloaded || [],
    };
  }

  const prevQuizIds = new Set((prev.quizzes || []).map((q) => q.id));
  const newQuizzes = curr.quizzes.filter((q) => !prevQuizIds.has(q.id));

  const prevExamsMap = new Map((prev.exams || []).map((e) => [e.id, e]));
  const newOrOpenedExams = curr.exams.filter((e) => {
    const old = prevExamsMap.get(e.id);
    if (!old) return true;
    if (!old.open && e.open) return true;
    if (old.score === null && e.score !== null) return true;
    return false;
  });

  const prevAssignIds = new Set((prev.assignments || []).map((a) => a.id));
  const newAssignments = curr.assignments.filter((a) => !prevAssignIds.has(a.id));

  const prevMatIds = new Set((prev.materials || []).map((m) => m.id));
  const newMaterials = curr.materials.filter((m) => !prevMatIds.has(m.id));

  const prevAnnIds = new Set((prev.announcements || []).map((a) => a.id));
  const newAnnouncements = curr.announcements.filter((a) => !prevAnnIds.has(a.id));

  const prevNotifIds = new Set((prev.notifications || []).map((n) => n.id));
  const newNotifications = curr.notifications.filter((n) => !prevNotifIds.has(n.id));

  const newlyDownloaded = syncStats?.newlyDownloaded || [];

  const hasChanges =
    newQuizzes.length > 0 ||
    newOrOpenedExams.length > 0 ||
    newAssignments.length > 0 ||
    newMaterials.length > 0 ||
    newAnnouncements.length > 0 ||
    newNotifications.length > 0 ||
    newlyDownloaded.length > 0;

  return {
    isFirstRun: false,
    hasChanges,
    newQuizzes,
    newOrOpenedExams,
    newAssignments,
    newMaterials,
    newAnnouncements,
    newNotifications,
    newlyDownloaded,
  };
}

// 6. Build Arabic Report Message
function formatReport(snapshot, diff, syncStats, forceFullReport = false) {
  const lines = [];
  const studentName =
    snapshot.student?.name_ar ||
    snapshot.student?.name ||
    snapshot.student?.email ||
    'طالب جامعة برج العرب التكنولوجية';

  const pendingQuizzes = snapshot.quizzes.filter(
    (q) => q.status === 'published' && !q.hasSubmitted
  );
  const openExams = snapshot.exams.filter((e) => !e.paper && e.open);
  const upcomingExams = snapshot.exams.filter((e) => !e.paper && e.upcoming);
  const pendingAssignments = snapshot.assignments.filter(
    (a) => !a.hasSubmitted && !a.expired
  );

  if (diff.isFirstRun || forceFullReport) {
    lines.push('🎓 *تقرير متابعة ومزامنة منصة جامعة برج العرب التكنولوجية (BATU LMS)*');
    lines.push(`👤 الطالب: *${studentName}*`);
    lines.push(`📚 عدد المواد المسجلة: *${snapshot.courses.length}*`);
    if (syncStats) {
      lines.push(
        `💾 ملفات المحاضرات على جهازك: *${syncStats.alreadyDownloaded + syncStats.newlyDownloaded.length}/${syncStats.totalFilesOnLms}* (تم تحميل *${syncStats.newlyDownloaded.length}* ملف جديد الآن)`
      );
    }
    lines.push('──────────────────────');

    // 1. Newly downloaded files summary if any
    if (syncStats && syncStats.newlyDownloaded.length > 0) {
      lines.push(`\n📥 *ملفات تم تحميلها وترتيبها على جهازك الآن (${syncStats.newlyDownloaded.length}):*`);
      for (const f of syncStats.newlyDownloaded.slice(0, 15)) {
        lines.push(`• *${f.courseName}* -> ${f.weekName} -> \`${f.fileName}\``);
      }
      if (syncStats.newlyDownloaded.length > 15) {
        lines.push(`  ... وعدد ${syncStats.newlyDownloaded.length - 15} ملفات أخرى تم تنظيمها في مجلد courses.`);
      }
    }

    // 2. Quizzes
    lines.push(`\n📝 *الكويزات المتاحة غير المحلولة على المنصة (${pendingQuizzes.length}):*`);
    if (pendingQuizzes.length === 0) {
      lines.push('✅ لا توجد كويزات أونلاين معلقة حالياً على المنصة.');
    } else {
      for (const q of pendingQuizzes) {
        lines.push(
          `• *${q.name}*\n  📖 المادة: ${q.courseName} (${q.weekName})\n  ❓ عدد الأسئلة: ${q.questionsCount || 'غير محدد'}\n  🔗 رابط الحل: ${q.url}`
        );
      }
    }

    // 3. Doctor / TA Announcements (especially Quiz Reminders!)
    if (snapshot.announcements.length > 0) {
      lines.push(`\n📢 *تنبيهات الكويزات وإعلانات المعيدين والدكاترة (${snapshot.announcements.length}):*`);
      for (const ann of snapshot.announcements.slice(0, 5)) {
        const cleanBody = ann.body.replace(/\r?\n/g, ' ').slice(0, 180);
        lines.push(
          `• *${ann.courseName}* (${ann.by})${ann.title ? ` — ${ann.title}` : ''}:\n  "${cleanBody}${ann.body.length > 180 ? '...' : ''}"`
        );
      }
    }

    // 4. Online Exams
    lines.push(`\n⚡ *الامتحانات الأونلاين المفتوحة أو القادمة (${openExams.length + upcomingExams.length}):*`);
    if (openExams.length === 0 && upcomingExams.length === 0) {
      lines.push('✅ لا توجد امتحانات أونلاين مفتوحة أو مجدولة قريباً حالياً.');
    } else {
      for (const e of openExams) {
        lines.push(
          `🔴 *[مفتوح الآن] ${e.title}*\n  📖 المادة: ${e.courseName}\n  ⏱ المدة: ${e.durationMinutes || '?'} دقيقة | الأسئلة: ${e.questions || '?'}\n  📅 من: ${e.startTime || 'الآن'} إلى: ${e.endTime || 'مفتوح'}\n  🔗 الرابط: ${e.url}`
        );
      }
      for (const e of upcomingExams) {
        lines.push(
          `🟡 *[قادم قريباً] ${e.title}*\n  📖 المادة: ${e.courseName}\n  ⏱ المدة: ${e.durationMinutes || '?'} دقيقة | الأسئلة: ${e.questions || '?'}\n  📅 يبدأ في: ${e.startTime || 'غير محدد'} وينتهي: ${e.endTime || 'غير محدد'}\n  🔗 الرابط: ${e.url}`
        );
      }
    }

    // 5. Pending Assignments
    lines.push(`\n📂 *التكليفات والشيتات المطلوب تسليمها (${pendingAssignments.length}):*`);
    if (pendingAssignments.length === 0) {
      lines.push('✅ لا توجد تكليفات مطلوبة حالياً.');
    } else {
      for (const a of pendingAssignments) {
        lines.push(
          `• *${a.name}*\n  📖 المادة: ${a.courseName}\n  ⏳ آخر موعد للتسليم: ${a.deadline || 'غير محدد'}\n  🔗 الرابط: ${a.url}`
        );
      }
    }
  } else {
    lines.push('🔔 *تحديث جديد ومزامنة ملفات منصة الجامعة (BATU LMS)*');
    lines.push(`👤 الطالب: *${studentName}*`);
    lines.push('──────────────────────');

    if (diff.newlyDownloaded && diff.newlyDownloaded.length > 0) {
      lines.push(`\n📥 *تم تحميل ملفات جديدة تلقائياً على جهازك (${diff.newlyDownloaded.length}):*`);
      for (const f of diff.newlyDownloaded) {
        lines.push(`• *${f.courseName}* (${f.weekName})\n  📄 الملف: \`${f.fileName}\``);
      }
    }

    if (diff.newQuizzes.length > 0) {
      lines.push(`\n🚨 *نزل كويز جديد (${diff.newQuizzes.length}):*`);
      for (const q of diff.newQuizzes) {
        lines.push(
          `• *${q.name}*\n  📖 المادة: ${q.courseName} (${q.weekName})\n  ❓ عدد الأسئلة: ${q.questionsCount || 'غير محدد'}\n  🔗 ادخل حل من هنا: ${q.url}`
        );
      }
    }

    if (diff.newOrOpenedExams.length > 0) {
      lines.push(`\n⚡ *تحديث في الامتحانات الأونلاين (${diff.newOrOpenedExams.length}):*`);
      for (const e of diff.newOrOpenedExams) {
        const statusTag = e.open
          ? '🔴 مفتوح الآن'
          : e.upcoming
            ? '🟡 مجدول قريباً'
            : e.score !== null
              ? `📊 ظهرت الدرجة (${e.rawScore ?? e.score}/${e.marksOutOf})`
              : 'تحديث';
        lines.push(
          `• *[${statusTag}] ${e.title}*\n  📖 المادة: ${e.courseName}\n  📅 الموعد: ${e.startTime || 'الآن'} -> ${e.endTime || 'مفتوح'}\n  🔗 الرابط: ${e.url}`
        );
      }
    }

    if (diff.newAssignments.length > 0) {
      lines.push(`\n📂 *تكليفات / شيتات جديدة (${diff.newAssignments.length}):*`);
      for (const a of diff.newAssignments) {
        lines.push(
          `• *${a.name}*\n  📖 المادة: ${a.courseName}\n  ⏳ الموعد النهائي: ${a.deadline || 'غير محدد'}\n  🔗 الرابط: ${a.url}`
        );
      }
    }

    if (diff.newAnnouncements.length > 0) {
      lines.push(`\n📢 *إعلانات جديدة من الدكاترة والمعيدين (${diff.newAnnouncements.length}):*`);
      for (const ann of diff.newAnnouncements) {
        lines.push(`• *${ann.courseName}* (${ann.by}): ${ann.title || ann.body}`);
      }
    }

    if (diff.newMaterials.length > 0) {
      lines.push(`\n📘 *محاضرات ومواد علمية جديدة (${diff.newMaterials.length}):*`);
      for (const m of diff.newMaterials.slice(0, 10)) {
        lines.push(`• [${m.type}] *${m.name}* — ${m.courseName} (${m.weekName})\n  🔗 ${m.url}`);
      }
    }

    if (pendingQuizzes.length > 0 || openExams.length > 0 || pendingAssignments.length > 0) {
      lines.push('\n⏰ *تذكير بالمهام المفتوحة حالياً:*');
      lines.push(
        `• كويزات بانتظار الحل: *${pendingQuizzes.length}* | امتحانات مفتوحة: *${openExams.length}* | شيتات مطلوبة: *${pendingAssignments.length}*`
      );
    }
  }

  return lines.join('\n');
}

// 7. Telegram Bot API Helper
async function sendTelegramMessage(token, chatId, text) {
  const maxLen = 3900;
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    let splitIdx = remaining.lastIndexOf('\n', maxLen);
    if (splitIdx <= 0) splitIdx = maxLen;
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }
  if (remaining) chunks.push(remaining);

  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const retry = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk.replace(/[*_`]/g, ''),
          disable_web_page_preview: true,
        }),
      });
      if (!retry.ok) {
        const errText = await retry.text();
        throw new Error(`خطأ من تيليجرام: ${errText}`);
      }
    }
  }
}

async function discoverTelegramChatId(token) {
  if (!token) {
    console.error('❌ يرجى وضع TELEGRAM_BOT_TOKEN في ملف .env أولاً.');
    process.exit(1);
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const data = await res.json();
  if (!data.ok) {
    console.error('❌ تأكد من صحة TELEGRAM_BOT_TOKEN:', data.description);
    process.exit(1);
  }
  const updates = data.result || [];
  if (updates.length === 0) {
    console.log(
      'ℹ️ لم نجد رسائل حديثة للبوت. افتح البوت في تيليجرام واضغط Start أو أرسل له أي رسالة ثم شغّل الأمر مرة أخرى.'
    );
    return;
  }
  const lastChat =
    updates[updates.length - 1].message?.chat ||
    updates[updates.length - 1].my_chat_member?.chat;
  if (lastChat) {
    console.log(`✅ تم العثور على معرف المحادثة بنجاح!`);
    console.log(`TELEGRAM_CHAT_ID=${lastChat.id}`);
    console.log(
      `الاسم: ${lastChat.first_name || ''} ${lastChat.last_name || ''} (@${lastChat.username || ''})`
    );
  }
}

// 8. Main Entry Point
async function main() {
  const args = process.argv.slice(2);
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
  const academicId = (process.env.BATU_ACADEMIC_ID || '').trim();
  const password = (process.env.BATU_PASSWORD || '').trim();
  const sendDailyDigest =
    (process.env.SEND_DAILY_DIGEST || 'true').trim().toLowerCase() === 'true';

  if (args.includes('--get-chat-id')) {
    await discoverTelegramChatId(botToken);
    return;
  }

  if (!academicId || !password) {
    console.log(
      '⚠️ يرجى إدخال BATU_ACADEMIC_ID و BATU_PASSWORD داخل ملف .env أولاً لتشغيل المتابعة.'
    );
    process.exit(1);
  }

  console.log('🔄 جاري الاتصال بمنصة جامعة برج العرب التكنولوجية (batechu.com)...');
  const client = new BatuClient();
  await client.ensureAuthenticated(academicId, password);

  const shouldDownload = !args.includes('--no-download');
  console.log(
    '📥 تم تسجيل الدخول بنجاح! جاري فحص المقررات وتحميل الملفات وترتيبها حسب الأسابيع...'
  );
  const { snapshot: currentSnapshot, syncStats } = await collectAndSyncLmsData(client, {
    downloadFiles: shouldDownload,
  });

  let previousSnapshot = null;
  if (fs.existsSync(STATE_PATH)) {
    try {
      previousSnapshot = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    } catch {
      previousSnapshot = null;
    }
  }

  const diff = diffSnapshots(previousSnapshot, currentSnapshot, syncStats);
  const forceReport =
    args.includes('--report') ||
    sendDailyDigest ||
    syncStats.newlyDownloaded.length > 0;

  if (!args.includes('--dry-run')) {
    fs.writeFileSync(STATE_PATH, JSON.stringify(currentSnapshot, null, 2), 'utf8');
  }

  const reportText = formatReport(currentSnapshot, diff, syncStats, forceReport);
  console.log('\n' + reportText + '\n');

  const shouldNotify = diff.isFirstRun || diff.hasChanges || forceReport;
  if (shouldNotify && botToken && chatId) {
    console.log('📨 جاري إرسال التنبيه إلى تيليجرام...');
    await sendTelegramMessage(botToken, chatId, reportText);
    console.log('✅ تم إرسال التنبيه إلى تيليجرام بنجاح!');
  } else if (shouldNotify && (!botToken || !chatId)) {
    console.log(
      'ℹ️ لم يتم إرسال إشعار تيليجرام لأن TELEGRAM_BOT_TOKEN أو TELEGRAM_CHAT_ID غير مضافين بعد في ملف .env'
    );
  } else {
    console.log('✅ لا توجد تغييرات أو ملفات جديدة منذ آخر فحص.');
  }
}

main().catch((err) => {
  console.error('❌ حدث خطأ أثناء فحص المنصة:', err.message);
  process.exit(1);
});
