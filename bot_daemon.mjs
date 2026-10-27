import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LmsAssignmentUploader,
  loadApprovals,
  saveApprovals,
  sendTelegramText,
} from './assignments.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, '.env');
const STATE_OFFSET_PATH = path.join(__dirname, '.bot_offset');

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

const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const TARGET_CHAT_ID = (process.env.TELEGRAM_CHAT_ID || '').trim();
const ACADEMIC_ID = (process.env.BATU_ACADEMIC_ID || '').trim();
const PASSWORD = (process.env.BATU_PASSWORD || '').trim();

if (!BOT_TOKEN || !ACADEMIC_ID || !PASSWORD) {
  console.error('❌ تأكد من توفر TELEGRAM_BOT_TOKEN و BATU_ACADEMIC_ID و BATU_PASSWORD داخل ملف .env');
  process.exit(1);
}

function loadOffset() {
  try {
    if (fs.existsSync(STATE_OFFSET_PATH)) {
      const val = parseInt(fs.readFileSync(STATE_OFFSET_PATH, 'utf8').trim(), 10);
      if (!Number.isNaN(val) && val > 0) return val;
    }
  } catch {
    // ignore
  }
  return 0;
}

function saveOffset(offset) {
  try {
    fs.writeFileSync(STATE_OFFSET_PATH, String(offset), 'utf8');
  } catch {
    // ignore
  }
}

async function answerCallbackQuery(token, callbackQueryId, text, showAlert = false) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: showAlert,
      }),
    });
  } catch (err) {
    console.error('فشل الرد على callback_query:', err.message);
  }
}

async function handleUpload(materialId, chatId) {
  const approvals = loadApprovals();
  const targetItem = approvals.find((a) => Number(a.materialId) === Number(materialId));

  if (!targetItem) {
    await sendTelegramText(
      BOT_TOKEN,
      chatId,
      `⚠️ لم يتم العثور على تكليف برقم المعرف \`#${materialId}\` في قائمة التكليفات المحلية.`
    );
    return false;
  }

  if (targetItem.status === 'uploaded') {
    await sendTelegramText(
      BOT_TOKEN,
      chatId,
      `ℹ️ التكليف *${targetItem.courseName} - ${targetItem.assignmentName}* تم رفعه وتسليمه بالفعل مسبقاً على المنصة!`
    );
    return true;
  }

  await sendTelegramText(
    BOT_TOKEN,
    chatId,
    `⏳ جاري رفع تكليف *${targetItem.courseName} - ${targetItem.assignmentName}* على المنصة، يرجى الانتظار ثوانٍ...`
  );

  const uploader = new LmsAssignmentUploader();
  await uploader.ensureAuthenticated(ACADEMIC_ID, PASSWORD);

  console.log(`⬆️ جاري رفع التكليف: ${targetItem.courseName} - ${targetItem.assignmentName}...`);
  const result = await uploader.uploadAssignment(targetItem);

  targetItem.status = 'uploaded';
  targetItem.uploadedAt = new Date().toISOString();
  targetItem.serverFileUrl = result.submission?.file || null;
  saveApprovals(approvals);

  const confirmMsg = [
    `🎉 *تم رفع وتسليم التكليف على منصة الجامعة بنجاح!*`,
    `──────────────────────`,
    `📖 *المادة:* ${targetItem.courseName} (${targetItem.weekName})`,
    `📂 *التكليف:* ${targetItem.assignmentName} (\`#${targetItem.materialId}\`)`,
    `🕒 *وقت التسليم:* ${result.submission?.created_at || targetItem.uploadedAt}`,
    result.submission?.file ? `🔗 *رابط ملفك المرفوع:* ${result.submission.file}` : '',
    result.alreadySubmitted ? `⚠️ *ملاحظة:* التكليف كان مسلماً بالفعل على المنصة سابقاً.` : '',
  ]
    .filter(Boolean)
    .join('\n');

  console.log('✅ اكتمل الرفع بنجاح:', targetItem.assignmentName);
  await sendTelegramText(BOT_TOKEN, chatId, confirmMsg);
  return true;
}

async function handleApproveAll(chatId) {
  const approvals = loadApprovals();
  const pending = approvals.filter((a) => a.status === 'pending_approval');

  if (pending.length === 0) {
    await sendTelegramText(
      BOT_TOKEN,
      chatId,
      `✅ لا توجد تكليفات معلقة بانتظار الاعتماد والرفع حالياً.`
    );
    return;
  }

  await sendTelegramText(
    BOT_TOKEN,
    chatId,
    `⏳ تم استلام موافقتك على الكل! جاري رفع عدد *(${pending.length})* تكليفات على المنصة...`
  );

  const uploader = new LmsAssignmentUploader();
  await uploader.ensureAuthenticated(ACADEMIC_ID, PASSWORD);

  let successCount = 0;
  for (const item of pending) {
    try {
      console.log(`⬆️ جاري رفع: ${item.courseName} - ${item.assignmentName}...`);
      const result = await uploader.uploadAssignment(item);
      item.status = 'uploaded';
      item.uploadedAt = new Date().toISOString();
      item.serverFileUrl = result.submission?.file || null;
      saveApprovals(approvals);
      successCount++;

      const singleMsg = [
        `✅ *تم تسليم:* ${item.courseName} - ${item.assignmentName}`,
        result.submission?.file ? `🔗 ${result.submission.file}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      await sendTelegramText(BOT_TOKEN, chatId, singleMsg);
    } catch (err) {
      console.error(`❌ فشل رفع ${item.assignmentName}:`, err.message);
      await sendTelegramText(
        BOT_TOKEN,
        chatId,
        `❌ حدث خطأ أثناء رفع *${item.assignmentName}*: ${err.message}`
      );
    }
  }

  await sendTelegramText(
    BOT_TOKEN,
    chatId,
    `🎉 اكتملت العملية! تم رفع *${successCount}/${pending.length}* تكليفات بنجاح على المنصة.`
  );
}

async function sendStatusSummary(chatId) {
  const approvals = loadApprovals();
  if (approvals.length === 0) {
    await sendTelegramText(BOT_TOKEN, chatId, 'ℹ️ لا توجد تكليفات مسجلة في النظام حالياً.');
    return;
  }

  const lines = [
    `📊 *حالة التكليفات في النظام:*`,
    `──────────────────────`,
  ];

  for (const a of approvals) {
    const icon = a.status === 'uploaded' ? '✅' : '⏳';
    const statusAr = a.status === 'uploaded' ? 'تم الرفع على المنصة' : 'بانتظار موافقتك';
    lines.push(
      `${icon} *${a.courseName}* - ${a.assignmentName} (\`#${a.materialId}\`)\n   الحالة: *${statusAr}*\n   الموعد النهائي: \`${a.deadline}\``
    );
  }

  lines.push('');
  lines.push('💡 *للرفع الفوري:* اضغط على أزرار الاعتماد السابقة أو أرسل `approve all` أو `approve <id>`.');

  await sendTelegramText(BOT_TOKEN, chatId, lines.join('\n'));
}

async function processUpdate(update) {
  // 1. Process Callback Queries (Inline Buttons)
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message?.chat?.id || TARGET_CHAT_ID;
    const data = cb.data || '';

    console.log(`🔘 استلام نقرة زر: "${data}" من المستخدم: ${cb.from?.first_name || 'غير معروف'}`);

    if (data.startsWith('approve:')) {
      const matId = Number(data.split(':')[1]);
      await answerCallbackQuery(BOT_TOKEN, cb.id, '⏳ جاري اعتماد ورفع التكليف الآن...');
      try {
        await handleUpload(matId, chatId);
      } catch (err) {
        console.error('❌ خطأ أثناء الرفع:', err.message);
        await sendTelegramText(
          BOT_TOKEN,
          chatId,
          `❌ حدث خطأ أثناء محاولة رفع التكليف على المنصة:\n\`${err.message}\``
        );
      }
    } else if (data.startsWith('hold:')) {
      const matId = Number(data.split(':')[1]);
      await answerCallbackQuery(BOT_TOKEN, cb.id, '⏸ تم تأجيل رفع هذا التكليف لحين رغبتك.');
      await sendTelegramText(
        BOT_TOKEN,
        chatId,
        `⏸ تم تأجيل رفع التكليف \`#${matId}\`. يمكنك اعتماده في أي وقت لاحقاً بإرسال: \`approve ${matId}\``
      );
    } else {
      await answerCallbackQuery(BOT_TOKEN, cb.id, 'تم استلام الأمر.');
    }
    return;
  }

  // 2. Process Text Messages
  if (update.message?.text) {
    const msg = update.message;
    const chatId = msg.chat?.id || TARGET_CHAT_ID;
    const text = msg.text.trim();
    const lower = text.toLowerCase();

    console.log(`💬 استلام رسالة نصية: "${text}" من: ${msg.from?.first_name || 'غير معروف'}`);

    if (
      lower === '/start' ||
      lower === 'start' ||
      lower === 'اهلا' ||
      lower === 'أهلا' ||
      lower === 'مرحبا' ||
      lower === 'سلام'
    ) {
      const welcome = [
        `👋 *مرحباً بك! بوت متابعة منصة جامعة برج العرب التكنولوجية يعمل في الخلفية بنجاح.*`,
        `──────────────────────`,
        `🤖 *الخدمة التلقائية مفعلة:* يستمع البوت لأي ضغطة زر أو أمر اعتماد فورياً ويرفعه للمنصة في ثوانٍ.`,
        ``,
        `📌 *الأوامر السريعة المتاحة:*`,
        `• \`status\` أو \`الحالة\` — عرض حالة جميع التكليفات (المعلقة والمرفوعة).`,
        `• \`approve all\` أو \`اعتمد الكل\` — رفع جميع التكليفات المنجزة دفعة واحدة.`,
        `• \`approve <id>\` أو \`اعتمد <id>\` — رفع تكليف محدد برقم المعرف الخاص به.`,
        `• \`help\` أو \`مساعدة\` — عرض هذه التعليمات.`,
      ].join('\n');
      await sendTelegramText(BOT_TOKEN, chatId, welcome);
      return;
    }

    if (lower === 'status' || lower === 'الحالة' || lower === 'عرض الحالة') {
      await sendStatusSummary(chatId);
      return;
    }

    if (
      lower === 'approve all' ||
      lower === 'approved all' ||
      lower === 'اعتمد الكل' ||
      lower === 'موافق على الكل' ||
      lower === 'ارفع الكل'
    ) {
      await handleApproveAll(chatId);
      return;
    }

    const approveMatch =
      lower.match(/^approve[d]?\s+(\d+)$/) ||
      text.match(/^اعتمد\s+(\d+)$/) ||
      text.match(/^ارفع\s+(\d+)$/);

    if (approveMatch) {
      const matId = Number(approveMatch[1]);
      try {
        await handleUpload(matId, chatId);
      } catch (err) {
        console.error('❌ خطأ أثناء الرفع:', err.message);
        await sendTelegramText(
          BOT_TOKEN,
          chatId,
          `❌ حدث خطأ أثناء محاولة رفع التكليف على المنصة:\n\`${err.message}\``
        );
      }
      return;
    }

    if (lower === 'help' || lower === 'مساعدة' || lower === '/help') {
      const help = [
        `📖 *دليل أوامر البوت السريعة:*`,
        `──────────────────────`,
        `• \`status\` أو \`الحالة\` : كشف التكليفات المحلولة وحالتها.`,
        `• \`approve all\` : اعتماد ورفع كل التكليفات المعلقة دفعة واحدة.`,
        `• \`approve 12084\` : اعتماد ورفع تكليف جافا 2.`,
        `• \`approve 10926\` : اعتماد ورفع تكليف شبكات سيسكو.`,
      ].join('\n');
      await sendTelegramText(BOT_TOKEN, chatId, help);
    }
  }
}

async function startPollingLoop() {
  console.log('🤖 تم تشغيل خدمة استماع تيليجرام الخلفية (Telegram Bot Daemon)...');
  console.log('📡 جاري مراقبة أزرار الاعتماد والرسائل في الوقت الفعلي...');

  let offset = loadOffset();

  while (true) {
    try {
      const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=25&allowed_updates=${encodeURIComponent(
        JSON.stringify(['message', 'callback_query'])
      )}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(35000) });
      if (!res.ok) {
        const errText = await res.text();
        console.error(`⚠️ خطأ من تيليجرام (${res.status}): ${errText}`);
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }

      const data = await res.json();
      if (!data.ok || !Array.isArray(data.result)) {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      for (const update of data.result) {
        if (update.update_id >= offset) {
          offset = update.update_id + 1;
          saveOffset(offset);
        }
        await processUpdate(update);
      }
    } catch (err) {
      if (err.name !== 'TimeoutError') {
        console.error('⚠️ انقطاع مؤقت في الاتصال، جاري إعادة المحاولة:', err.message);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// Start daemon
startPollingLoop().catch((err) => {
  console.error('❌ خطأ جسيم أوقف خدمة الاستماع:', err);
  process.exit(1);
});
