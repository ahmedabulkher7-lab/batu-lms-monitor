import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, '.env');
const COOKIES_PATH = path.join(__dirname, 'cookies.json');
const APPROVALS_PATH = path.join(__dirname, 'pending_approvals.json');
const BASE_URL = 'https://batechu.com';

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

export function loadApprovals() {
  if (!fs.existsSync(APPROVALS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(APPROVALS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

export function saveApprovals(items) {
  fs.writeFileSync(APPROVALS_PATH, JSON.stringify(items, null, 2), 'utf8');
}

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
      // ignore
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

export class LmsAssignmentUploader {
  constructor() {
    this.jar = new CookieJar(COOKIES_PATH);
  }

  extractInertiaPage(html) {
    const match = html.match(/data-page="([^"]+)"/);
    if (!match) return null;
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
    if (cookieHeader) headers['Cookie'] = cookieHeader;

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
          { method: 'GET', headers: { Referer: url } },
          maxRedirects - 1
        );
      }
    }

    const text = await res.text();
    const page = this.extractInertiaPage(text);
    const csrfMatch = text.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/i);
    const csrfToken = csrfMatch ? csrfMatch[1] : page?.props?.csrf_token || '';

    return { status: res.status, url, text, page, csrfToken };
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

    await this.request('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: BASE_URL,
        Referer: `${BASE_URL}/lms/login`,
        ...(csrfToken ? { 'X-CSRF-TOKEN': csrfToken } : {}),
      },
      body: JSON.stringify({ email, password, remember: true }),
    });

    const verify = await this.request('/lms/dashboard');
    if (!verify.page || verify.page.component === 'Student/login') {
      throw new Error('فشل تسجيل الدخول إلى المنصة.');
    }
    return verify.page.props?.auth?.user;
  }

  async uploadAssignment(entry) {
    const fullPdfPath = path.resolve(__dirname, entry.solutionPdfPath);
    if (!fs.existsSync(fullPdfPath)) {
      throw new Error(`ملف الحل غير موجود: ${fullPdfPath}`);
    }

    const weekUrl = `/lms/courses/weeks/${entry.weekSlug}/materials`;
    const weekRes = await this.request(weekUrl);
    const csrfToken = weekRes.csrfToken;
    const materials = weekRes.page?.props?.week?.materials || [];
    const targetMat = materials.find((m) => Number(m.id) === Number(entry.materialId));

    if (targetMat && Array.isArray(targetMat.assignments) && targetMat.assignments.length > 0) {
      return {
        alreadySubmitted: true,
        submission: targetMat.assignments[0],
      };
    }

    const fileBuffer = fs.readFileSync(fullPdfPath);
    const fileBlob = new Blob([fileBuffer], { type: 'application/pdf' });
    const uploadName = entry.uploadFileName || path.basename(fullPdfPath);

    const form = new FormData();
    form.append('material_id', String(entry.materialId));
    form.append('idempotency_key', crypto.randomUUID());
    if (entry.comment) {
      form.append('comment', entry.comment);
    }
    form.append('file', fileBlob, uploadName);

    const postRes = await this.request('/lms/assignments', {
      method: 'POST',
      headers: {
        Origin: BASE_URL,
        Referer: `${BASE_URL}${weekUrl}`,
        ...(csrfToken ? { 'X-CSRF-TOKEN': csrfToken } : {}),
      },
      body: form,
    });

    const verifyWeek = await this.request(weekUrl);
    const updatedMaterials = verifyWeek.page?.props?.week?.materials || [];
    const updatedMat = updatedMaterials.find(
      (m) => Number(m.id) === Number(entry.materialId)
    );

    if (
      updatedMat &&
      Array.isArray(updatedMat.assignments) &&
      updatedMat.assignments.length > 0
    ) {
      return {
        alreadySubmitted: false,
        submission: updatedMat.assignments[0],
      };
    }

    const errObj = postRes.page?.props?.errors || {};
    throw new Error(
      `لم يتأكد رفع الملف على المنصة (HTTP ${postRes.status}): ${JSON.stringify(errObj)}`
    );
  }
}

// Send Solved PDF to Telegram with Inline Approval Buttons
export async function sendSolutionForApproval(token, chatId, entry) {
  const fullPdfPath = path.resolve(__dirname, entry.solutionPdfPath);
  if (!fs.existsSync(fullPdfPath)) {
    throw new Error(`ملف الحل غير موجود: ${fullPdfPath}`);
  }

  const caption = [
    `📝 *تم حل التكليف وتجهيز ملف الـ PDF للمراجعة!*`,
    `──────────────────────`,
    `📖 *المادة:* ${entry.courseName} (${entry.weekName})`,
    `📂 *التكليف:* ${entry.assignmentName} (\`#${entry.materialId}\`)`,
    `⏳ *آخر موعد للتسليم:* ${entry.deadline}`,
    `📄 *الملف المرفق:* \`${entry.uploadFileName || path.basename(fullPdfPath)}\``,
    ``,
    `💡 *للموافقة والرفع التلقائي على المنصة:*`,
    `• اضغط على الزر بالأسفل *(✅ اعتمد وارفع الحل للمنصة)*`,
    `• أو أرسل رسالة هنا فيها: \`approve ${entry.materialId}\` (أو \`approve all\` لرفع الكل)`,
  ].join('\n');

  const replyMarkup = {
    inline_keyboard: [
      [
        {
          text: `✅ اعتمد وارفع الحل للمنصة (Approve #${entry.materialId})`,
          callback_data: `approve:${entry.materialId}`,
        },
      ],
      [
        {
          text: `⏸ تأجيل المراجعة الآن`,
          callback_data: `hold:${entry.materialId}`,
        },
      ],
    ],
  };

  const fileBuffer = fs.readFileSync(fullPdfPath);
  const fileBlob = new Blob([fileBuffer], { type: 'application/pdf' });
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('document', fileBlob, entry.uploadFileName || path.basename(fullPdfPath));
  form.append('caption', caption);
  form.append('parse_mode', 'Markdown');
  form.append('reply_markup', JSON.stringify(replyMarkup));

  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`فشل إرسال ملف الحل إلى تيليجرام: ${errText}`);
  }
}

export async function sendTelegramText(token, chatId, text) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }),
  });
}

// Check Telegram Updates for Button Clicks or "approve" messages
export async function checkAndProcessTelegramApprovals(token, chatId, academicId, password) {
  if (!token || !chatId) return [];
  const approvals = loadApprovals();
  const pending = approvals.filter((a) => a.status === 'pending_approval');
  if (pending.length === 0) return [];

  const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  const data = await res.json();
  if (!data.ok || !Array.isArray(data.result)) return [];

  const approvedIds = new Set();
  let maxUpdateId = 0;

  for (const upd of data.result) {
    if (upd.update_id > maxUpdateId) maxUpdateId = upd.update_id;

    // 1. Inline button click
    if (upd.callback_query) {
      const cb = upd.callback_query;
      const cbData = cb.data || '';
      if (cbData.startsWith('approve:')) {
        const matId = Number(cbData.split(':')[1]);
        if (matId) approvedIds.add(matId);
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: cb.id,
            text: `جاري رفع التكليف #${matId} على منصة الجامعة...`,
          }),
        });
      } else if (cbData.startsWith('hold:')) {
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: cb.id,
            text: 'تم تأجيل الرفع لحين موافقتك.',
          }),
        });
      }
    }

    // 2. Text message command
    const msgText = (upd.message?.text || '').trim().toLowerCase();
    if (msgText) {
      if (
        msgText === 'approve all' ||
        msgText === 'approved all' ||
        msgText === 'approve' ||
        msgText === 'approved' ||
        msgText === 'موافق' ||
        msgText === 'اعتمد'
      ) {
        for (const p of pending) approvedIds.add(Number(p.materialId));
      } else {
        const match = msgText.match(/approve[d]?\s+(\d+)/);
        if (match) {
          approvedIds.add(Number(match[1]));
        }
      }
    }
  }

  // Acknowledge updates so they aren't re-processed next time
  if (maxUpdateId > 0 && approvedIds.size > 0) {
    await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${maxUpdateId + 1}`);
  }

  if (approvedIds.size === 0) return [];

  const uploader = new LmsAssignmentUploader();
  await uploader.ensureAuthenticated(academicId, password);

  const uploadedResults = [];
  for (const item of approvals) {
    if (item.status === 'pending_approval' && approvedIds.has(Number(item.materialId))) {
      console.log(`⬆️ جاري رفع التكليف المعتمد: ${item.courseName} - ${item.assignmentName}...`);
      const result = await uploader.uploadAssignment(item);
      item.status = 'uploaded';
      item.uploadedAt = new Date().toISOString();
      item.serverFileUrl = result.submission?.file || null;
      saveApprovals(approvals);

      const confirmMsg = [
        `✅ *تم رفع وتسليم التكليف على منصة الجامعة بنجاح!*`,
        `──────────────────────`,
        `📖 *المادة:* ${item.courseName} (${item.weekName})`,
        `📂 *التكليف:* ${item.assignmentName} (\`#${item.materialId}\`)`,
        `🕒 *وقت التسليم على الخادم:* ${result.submission?.created_at || item.uploadedAt}`,
        result.submission?.file ? `🔗 *رابط ملفك المرفوع:* ${result.submission.file}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      await sendTelegramText(token, chatId, confirmMsg);
      uploadedResults.push(item);
    }
  }

  return uploadedResults;
}

// CLI Runner
async function main() {
  const args = process.argv.slice(2);
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
  const academicId = (process.env.BATU_ACADEMIC_ID || '').trim();
  const password = (process.env.BATU_PASSWORD || '').trim();

  const approvals = loadApprovals();

  if (args.includes('--status')) {
    console.log('=== حالة التكليفات المحلولة ===');
    for (const a of approvals) {
      console.log(
        `• [#${a.materialId}] ${a.courseName} - ${a.assignmentName} | الحالة: ${a.status} | الموعد النهائي: ${a.deadline}`
      );
    }
    return;
  }

  if (args.includes('--notify')) {
    const pending = approvals.filter((a) => a.status === 'pending_approval');
    if (pending.length === 0) {
      console.log('✅ لا توجد تكليفات معلقة بانتظار الموافقة حالياً.');
      return;
    }
    for (const item of pending) {
      console.log(`📨 جاري إرسال ملف الحل للمراجعة على تيليجرام: ${item.courseName} - ${item.assignmentName}...`);
      await sendSolutionForApproval(botToken, chatId, item);
      item.notifiedAt = new Date().toISOString();
    }
    saveApprovals(approvals);
    console.log('✅ تم إرسال جميع ملفات الحلول على تيليجرام مع أزرار الاعتماد والرفع!');
    return;
  }

  if (args.includes('--check-approvals')) {
    const uploaded = await checkAndProcessTelegramApprovals(
      botToken,
      chatId,
      academicId,
      password
    );
    if (uploaded.length === 0) {
      console.log('ℹ️ لم يتم استلام موافقة جديدة من تيليجرام بعد.');
    } else {
      console.log(`✅ تم اعتماد ورفع ${uploaded.length} تكليف بنجاح!`);
    }
    return;
  }

  const approveIdx = args.indexOf('--approve');
  if (approveIdx !== -1 || args.includes('--approve-all')) {
    const targetId =
      approveIdx !== -1 && args[approveIdx + 1] ? Number(args[approveIdx + 1]) : null;
    const toUpload = approvals.filter(
      (a) =>
        a.status === 'pending_approval' &&
        (args.includes('--approve-all') || Number(a.materialId) === targetId)
    );

    if (toUpload.length === 0) {
      console.log('ℹ️ لا توجد تكليفات مطابقة بانتظار الرفع.');
      return;
    }

    const uploader = new LmsAssignmentUploader();
    await uploader.ensureAuthenticated(academicId, password);

    for (const item of toUpload) {
      console.log(`⬆️ جاري رفع التكليف على المنصة: ${item.courseName} - ${item.assignmentName}...`);
      const result = await uploader.uploadAssignment(item);
      item.status = 'uploaded';
      item.uploadedAt = new Date().toISOString();
      item.serverFileUrl = result.submission?.file || null;
      saveApprovals(approvals);

      const confirmMsg = [
        `✅ *تم رفع وتسليم التكليف على منصة الجامعة بنجاح!*`,
        `──────────────────────`,
        `📖 *المادة:* ${item.courseName} (${item.weekName})`,
        `📂 *التكليف:* ${item.assignmentName} (\`#${item.materialId}\`)`,
        `🕒 *وقت التسليم على الخادم:* ${result.submission?.created_at || item.uploadedAt}`,
        result.submission?.file ? `🔗 *رابط ملفك المرفوع:* ${result.submission.file}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      console.log('\n' + confirmMsg + '\n');
      if (botToken && chatId) {
        await sendTelegramText(botToken, chatId, confirmMsg);
      }
    }
    return;
  }

  console.log('Usage: node assignments.mjs [--status | --notify | --check-approvals | --approve <id> | --approve-all]');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error('❌ خطأ:', err.message);
    process.exit(1);
  });
}
