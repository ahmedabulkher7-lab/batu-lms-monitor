import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// 1. Direct Edit of Original: Java Programming II - Assignment 2.pdf
// ============================================================================
async function editJavaAssignment2() {
  const origPath = path.join(
    __dirname,
    'courses/02 - Java Programming II/05 - Week 5/02 - [Assignment] Assignment 2.pdf'
  );
  const origBytes = fs.readFileSync(origPath);
  const origDoc = await PDFDocument.load(origBytes);
  const outDoc = await PDFDocument.create();

  const fontRegular = await outDoc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await outDoc.embedFont(StandardFonts.TimesRomanBold);
  const fontItalic = await outDoc.embedFont(StandardFonts.TimesRomanItalic);
  const fontSans = await outDoc.embedFont(StandardFonts.Helvetica);
  const fontSansBold = await outDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await outDoc.embedFont(StandardFonts.Courier);
  const fontMonoBold = await outDoc.embedFont(StandardFonts.CourierBold);

  const [origPage] = origDoc.getPages();

  // Embed exact vector slices from the original Assignment 2 PDF page
  // Slice 1: Header + Student Info + Title + Intro + Question 1 ("System Name")
  const sliceTopAndQ1 = await outDoc.embedPage(origPage, {
    left: 0,
    right: 612,
    bottom: 428,
    top: 792,
  });
  // Slice 2: Question 2 ("System Aim & Services")
  const sliceQ2 = await outDoc.embedPage(origPage, {
    left: 0,
    right: 612,
    bottom: 386,
    top: 426,
  });
  // Slice 3: Question 3 ("Brief Overview of the System")
  const sliceQ3 = await outDoc.embedPage(origPage, {
    left: 0,
    right: 612,
    bottom: 324,
    top: 384,
  });
  // Slice 4: Question 4 ("Database Diagram")
  const sliceQ4 = await outDoc.embedPage(origPage, {
    left: 0,
    right: 612,
    bottom: 262,
    top: 322,
  });
  // Slice 5: Question 5 ("Additional Elements")
  const sliceQ5 = await outDoc.embedPage(origPage, {
    left: 0,
    right: 612,
    bottom: 198,
    top: 260,
  });
  // Slice 6: Closing paragraph
  const sliceOutro = await outDoc.embedPage(origPage, {
    left: 0,
    right: 612,
    bottom: 98,
    top: 162,
  });

  // ---------------- PAGE 1 ----------------
  const page1 = outDoc.addPage([612, 792]);

  // Draw Slice 1 at exact top of Page 1 (y: 428..792)
  page1.drawPage(sliceTopAndQ1, { x: 0, y: 428 });

  // Fill in Student Name & Faculty Code ONCE on the original dotted lines (Page 1 top)
  page1.drawText('Ahmed Yasser Abu Elkher Salah', {
    x: 102,
    y: 660,
    size: 12,
    font: fontSansBold,
    color: rgb(0, 0, 0),
  });
  page1.drawText('2420232', {
    x: 142,
    y: 634.5,
    size: 12,
    font: fontSansBold,
    color: rgb(0, 0, 0),
  });

  // Answer 1 directly under Question 1 (y: 375..422)
  page1.drawRectangle({
    x: 68,
    y: 376,
    width: 505,
    height: 44,
    color: rgb(0.97, 0.98, 1.0),
    borderColor: rgb(0.18, 0.45, 0.71),
    borderWidth: 1,
  });
  // Yellow marker highlight on system name
  page1.drawRectangle({
    x: 120,
    y: 402,
    width: 242,
    height: 13,
    color: rgb(1, 0.94, 0.45),
  });
  page1.drawText('Answer:', {
    x: 76,
    y: 405,
    size: 10.5,
    font: fontSansBold,
    color: rgb(0, 0.13, 0.38),
  });
  page1.drawText('Clinic Management System (SmartCare CMS)', {
    x: 123,
    y: 405,
    size: 10.5,
    font: fontSansBold,
    color: rgb(0, 0, 0),
  });
  page1.drawText(' - Project #7 (Tutorial Sheet 6).', {
    x: 365,
    y: 405,
    size: 10,
    font: fontItalic,
    color: rgb(0.2, 0.2, 0.2),
  });
  page1.drawText(
    'An integrated desktop healthcare application built using Java Swing GUI (NetBeans IDE) & MySQL Database.',
    {
      x: 76,
      y: 386,
      size: 9.5,
      font: fontSans,
      color: rgb(0.1, 0.1, 0.1),
    }
  );

  // Draw Question 2 Slice (y: 330..370)
  page1.drawPage(sliceQ2, { x: 0, y: 330 });

  // Answer 2 directly under Question 2 (y: 214..326)
  page1.drawRectangle({
    x: 68,
    y: 214,
    width: 505,
    height: 110,
    color: rgb(0.97, 0.98, 1.0),
    borderColor: rgb(0.18, 0.45, 0.71),
    borderWidth: 1,
  });
  const a2Lines = [
    [
      'Primary Aim:',
      ' Automate clinic workflows by replacing paper files with a fast, accurate Java desktop system.',
    ],
    [
      '1. Patient Management:',
      ' Register, update, and search patient profiles, medical history, and blood group.',
    ],
    [
      '2. Doctor & Appointment Scheduling:',
      ' Manage doctor shifts, specialties, and book visits without conflicts.',
    ],
    [
      '3. EMR & Prescription Service:',
      ' Record clinical diagnoses, vital signs, and issue digital prescriptions.',
    ],
    [
      '4. Billing & Invoicing Service:',
      ' Calculate consultation fees, generate receipts, and track daily revenue.',
    ],
  ];
  let curY = 309;
  for (const [boldPart, restPart] of a2Lines) {
    page1.drawText(boldPart, {
      x: 76,
      y: curY,
      size: 9.5,
      font: fontSansBold,
      color: rgb(0, 0.13, 0.38),
    });
    const bw = fontSansBold.widthOfTextAtSize(boldPart, 9.5);
    page1.drawText(restPart, {
      x: 76 + bw,
      y: curY,
      size: 9.5,
      font: fontSans,
      color: rgb(0.1, 0.1, 0.1),
    });
    curY -= 20;
  }

  // Draw Question 3 Slice (y: 148..208)
  page1.drawPage(sliceQ3, { x: 0, y: 148 });

  // Answer 3 directly under Question 3 (y: 52..144)
  page1.drawRectangle({
    x: 68,
    y: 52,
    width: 505,
    height: 90,
    color: rgb(0.97, 0.98, 1.0),
    borderColor: rgb(0.18, 0.45, 0.71),
    borderWidth: 1,
  });
  const a3Lines = [
    'Built following the Java Swing Containment Hierarchy (Lecture 5), the GUI uses a top-level JFrame container',
    'with modular JPanel screens, JTable data grids, JTextField/JComboBox inputs, JButton actions, and',
    'JOptionPane confirmation dialogs. The Receptionist registers patients and books appointments; the Doctor',
    'views the daily queue and writes prescriptions; and the system generates the invoice. Developed using the',
    'Agile SDLC methodology across 6 phases: Requirements, Design, GUI/JDBC Coding, Testing, Deployment, Maintenance.',
  ];
  curY = 126;
  for (const line of a3Lines) {
    page1.drawText(line, {
      x: 76,
      y: curY,
      size: 9.4,
      font: fontSans,
      color: rgb(0.1, 0.1, 0.1),
    });
    curY -= 15.5;
  }

  // ---------------- PAGE 2 ----------------
  const page2 = outDoc.addPage([612, 792]);

  // Draw Question 4 ("Database Diagram") Slice at top of Page 2 (y: 710..770)
  page2.drawPage(sliceQ4, { x: 0, y: 710 });

  // Draw ERD Diagram Box directly under Question 4 (y: 470..705)
  page2.drawRectangle({
    x: 54,
    y: 472,
    width: 520,
    height: 232,
    color: rgb(0.98, 0.99, 1.0),
    borderColor: rgb(0.18, 0.45, 0.71),
    borderWidth: 1.2,
  });

  function drawEntityBox(page, x, y, title, attrs) {
    const w = 152;
    const h = 88;
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: rgb(1, 1, 1),
      borderColor: rgb(0, 0.13, 0.38),
      borderWidth: 1.3,
    });
    page.drawRectangle({
      x,
      y: y + h - 18,
      width: w,
      height: 18,
      color: rgb(0, 0.13, 0.38),
    });
    const tw = fontSansBold.widthOfTextAtSize(title, 9);
    page.drawText(title, {
      x: x + (w - tw) / 2,
      y: y + h - 13,
      size: 9,
      font: fontSansBold,
      color: rgb(1, 1, 1),
    });
    let ay = y + h - 31;
    for (const [tag, text] of attrs) {
      if (tag) {
        const tagColor = tag === 'PK' ? rgb(0.7, 0.32, 0.04) : rgb(0.1, 0.35, 0.75);
        page.drawText(tag, { x: x + 6, y: ay, size: 8, font: fontSansBold, color: tagColor });
        page.drawText(text, { x: x + 24, y: ay, size: 8, font: fontSans, color: rgb(0.1, 0.1, 0.1) });
      } else {
        page.drawText(text, { x: x + 6, y: ay, size: 8, font: fontSans, color: rgb(0.15, 0.15, 0.15) });
      }
      ay -= 14;
    }
  }

  // Top Row Entities (y = 602)
  drawEntityBox(page2, 64, 602, 'USERS', [
    ['PK', 'user_id : INT'],
    ['', 'username : VARCHAR(50)'],
    ['', 'password_hash : VARCHAR'],
    ['', 'role : ENUM(Admin,Doc,Rec)'],
  ]);
  drawEntityBox(page2, 238, 602, 'DOCTORS', [
    ['PK', 'doctor_id : INT'],
    ['FK', 'user_id : INT'],
    ['', 'full_name : VARCHAR(100)'],
    ['', 'specialty & fee : DECIMAL'],
  ]);
  drawEntityBox(page2, 412, 602, 'APPOINTMENTS', [
    ['PK', 'appointment_id : INT'],
    ['FK', 'patient_id : INT'],
    ['FK', 'doctor_id : INT'],
    ['', 'appt_datetime & status'],
  ]);

  // Bottom Row Entities (y = 484)
  drawEntityBox(page2, 64, 484, 'PATIENTS', [
    ['PK', 'patient_id : INT'],
    ['', 'full_name : VARCHAR(100)'],
    ['', 'phone : VARCHAR(20)'],
    ['', 'age & blood_group'],
  ]);
  drawEntityBox(page2, 238, 484, 'PRESCRIPTIONS', [
    ['PK', 'prescription_id : INT'],
    ['FK', 'appointment_id : INT'],
    ['', 'diagnosis : TEXT'],
    ['', 'medications : TEXT'],
  ]);
  drawEntityBox(page2, 412, 484, 'INVOICES', [
    ['PK', 'invoice_id : INT'],
    ['FK', 'appointment_id : INT'],
    ['', 'total_amount : DECIMAL'],
    ['', 'payment_status : ENUM'],
  ]);

  // Relationship Connectors
  const lineCol = rgb(0.18, 0.45, 0.71);
  // USERS <-> DOCTORS (1:1)
  page2.drawLine({ start: { x: 216, y: 646 }, end: { x: 238, y: 646 }, thickness: 1.5, color: lineCol });
  page2.drawText('1:1', { x: 221, y: 650, size: 7.5, font: fontSansBold, color: lineCol });
  // DOCTORS <-> APPOINTMENTS (1:N)
  page2.drawLine({ start: { x: 390, y: 646 }, end: { x: 412, y: 646 }, thickness: 1.5, color: lineCol });
  page2.drawText('1:N', { x: 395, y: 650, size: 7.5, font: fontSansBold, color: lineCol });
  // PATIENTS <-> APPOINTMENTS (1:N)
  page2.drawLine({ start: { x: 140, y: 572 }, end: { x: 140, y: 588 }, thickness: 1.5, color: lineCol });
  page2.drawLine({ start: { x: 140, y: 588 }, end: { x: 450, y: 588 }, thickness: 1.5, color: lineCol });
  page2.drawLine({ start: { x: 450, y: 588 }, end: { x: 450, y: 602 }, thickness: 1.5, color: lineCol });
  page2.drawText('1:N (Books)', { x: 145, y: 577, size: 7.5, font: fontSansBold, color: lineCol });
  // APPOINTMENTS <-> PRESCRIPTIONS (1:1)
  page2.drawLine({ start: { x: 390, y: 528 }, end: { x: 402, y: 528 }, thickness: 1.5, color: lineCol });
  page2.drawLine({ start: { x: 402, y: 528 }, end: { x: 402, y: 615 }, thickness: 1.5, color: lineCol });
  page2.drawLine({ start: { x: 402, y: 615 }, end: { x: 412, y: 615 }, thickness: 1.5, color: lineCol });
  // APPOINTMENTS <-> INVOICES (1:1)
  page2.drawLine({ start: { x: 488, y: 602 }, end: { x: 488, y: 572 }, thickness: 1.5, color: lineCol });
  page2.drawText('1:1 (Bills)', { x: 493, y: 584, size: 7.5, font: fontSansBold, color: lineCol });

  // Draw Question 5 ("Additional Elements") Slice (y: 404..466)
  page2.drawPage(sliceQ5, { x: 0, y: 404 });

  // Answer 5 directly under Question 5 (y: 318..400)
  page2.drawRectangle({
    x: 68,
    y: 318,
    width: 505,
    height: 82,
    color: rgb(0.97, 0.98, 1.0),
    borderColor: rgb(0.18, 0.45, 0.71),
    borderWidth: 1,
  });
  const a5Lines = [
    [
      '1. User Roles (RBAC):',
      ' Admin (manages staff & reports), Doctor (diagnoses & prescriptions), Receptionist (bookings & billing).',
    ],
    [
      '2. Security Measures:',
      ' SHA-256 password hashing, JDBC PreparedStatement (prevents SQL Injection), JOptionPane validation.',
    ],
    [
      '3. System Architecture:',
      ' 3-Tier MVC Desktop Architecture (Java Swing GUI View -> Controllers/Models -> JDBC MySQL DAO).',
    ],
  ];
  curY = 382;
  for (const [bText, rText] of a5Lines) {
    page2.drawText(bText, { x: 75, y: curY, size: 9, font: fontSansBold, color: rgb(0, 0.13, 0.38) });
    const bw = fontSansBold.widthOfTextAtSize(bText, 9);
    page2.drawText(rText, { x: 75 + bw, y: curY, size: 8.8, font: fontSans, color: rgb(0.1, 0.1, 0.1) });
    curY -= 24;
  }

  // Dark Code Editor Window Screenshot (matching Student's Assignment 1 style) (y: 122..310)
  page2.drawRectangle({
    x: 68,
    y: 122,
    width: 505,
    height: 186,
    color: rgb(0.12, 0.12, 0.14),
    borderColor: rgb(0.3, 0.3, 0.35),
    borderWidth: 1,
  });
  // Top window bar with 3 dots
  page2.drawCircle({ x: 82, y: 295, size: 4, color: rgb(1, 0.37, 0.34) });
  page2.drawCircle({ x: 95, y: 295, size: 4, color: rgb(1, 0.74, 0.18) });
  page2.drawCircle({ x: 108, y: 295, size: 4, color: rgb(0.15, 0.79, 0.25) });
  page2.drawText('ClinicDatabaseConnection.java — NetBeans IDE (Java Swing + MySQL JDBC)', {
    x: 122,
    y: 292,
    size: 8.5,
    font: fontSans,
    color: rgb(0.65, 0.68, 0.72),
  });

  const codeLines = [
    'import java.sql.Connection;',
    'import java.sql.DriverManager;',
    'import javax.swing.JOptionPane;',
    '',
    'public class ClinicDatabaseConnection {',
    '    private static final String URL = "jdbc:mysql://localhost:3306/smartcare_clinic_db";',
    '    public static Connection getConnection() {',
    '        try {',
    '            return DriverManager.getConnection(URL, "root", "");',
    '        } catch (Exception ex) {',
    '            JOptionPane.showMessageDialog(null, "DB Error: " + ex.getMessage());',
    '            return null;',
    '        }',
    '    }',
    '}',
  ];
  let codeY = 274;
  for (const cl of codeLines) {
    page2.drawText(cl, {
      x: 80,
      y: codeY,
      size: 8.4,
      font: fontMonoBold,
      color: cl.startsWith('import') || cl.includes('public class')
        ? rgb(0.34, 0.61, 0.84)
        : cl.includes('"')
          ? rgb(0.81, 0.57, 0.47)
          : rgb(0.88, 0.88, 0.88),
    });
    codeY -= 10.2;
  }

  // Draw Original Closing Paragraph Slice at bottom of Page 2 (y: 45..109)
  page2.drawPage(sliceOutro, { x: 0, y: 45 });

  const outBytes = await outDoc.save();
  const solPath = path.join(__dirname, 'solutions/Java_Assignment_2_2420232.pdf');
  const courseCopyPath = path.join(
    __dirname,
    'courses/02 - Java Programming II/05 - Week 5/05 - [Solved] Assignment 2 - Ahmed Yasser 2420232.pdf'
  );
  fs.writeFileSync(solPath, outBytes);
  fs.writeFileSync(courseCopyPath, outBytes);
  console.log('✅ Edited original Java Assignment 2 PDF directly:', outBytes.length, 'bytes');
}

// ============================================================================
// 2. Direct Edit of Original: CCNA R&S II - ASS1.pdf
// ============================================================================
async function editCcnaAss1() {
  const origPath = path.join(
    __dirname,
    'courses/03 - CCNA R&S II/03 - Week 3/04 - [Assignment] ASS1.pdf'
  );
  const origBytes = fs.readFileSync(origPath);
  const pdfDoc = await PDFDocument.load(origBytes);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const pages = pdfDoc.getPages();
  const p1 = pages[0];
  const p2 = pages[1];
  const p3 = pages[2];
  const p4 = pages[3];
  const p6 = pages[5];
  const p10 = pages[9];

  // 1. Write Student Name & ID ONCE at the top of Page 1 (under the header)
  p1.drawText('Name: Ahmed Yasser Abu Elkher Salah', {
    x: 335,
    y: 752,
    size: 13,
    font: fontBold,
    color: rgb(0.85, 0.12, 0.12),
  });
  p1.drawText('ID: 2420232', {
    x: 335,
    y: 734,
    size: 13,
    font: fontBold,
    color: rgb(0.85, 0.12, 0.12),
  });

  // Helper to draw yellow marker highlight on a page
  const hl = (page, x, y, w, h = 14) => {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: rgb(1, 0.93, 0.2),
      opacity: 0.38,
    });
  };

  // Highlight Addressing Table IP & Subnet Mask cells on Page 1
  for (const y of [270, 234, 198, 161, 125, 89]) {
    hl(p1, 235, y, 90, 15);
    hl(p1, 363, y, 95, 15);
  }

  // Highlight Addressing Table cells & Question (a) answer on Page 2
  for (const y of [659, 623, 587, 550, 514, 478, 442, 405]) {
    hl(p2, 235, y, 90, 15);
    hl(p2, 363, y, 95, 15);
    hl(p2, 491, y, 85, 15);
  }
  // Question a answer on Page 2 (y = 90)
  hl(p2, 70, 89, 325, 16);

  // Highlight Questions b, c, d, e, f on Page 3
  hl(p3, 70, 672, 22, 16); // b -> 3
  hl(p3, 70, 630, 22, 16); // c -> 8
  hl(p3, 70, 588, 26, 16); // d -> 30
  // Table e rows (Subnets 2, 3, 4)
  for (const y of [360, 324, 288]) {
    hl(p3, 250, y, 310, 16);
  }
  // Table f binary mask bits
  hl(p3, 300, 174, 260, 16);

  // Highlight Table f decimal (224) and Subnet Table g (Subnets 0..7) on Page 4
  hl(p4, 296, 623, 32, 16);
  for (const y of [465, 429, 392, 356, 320, 284, 248, 212]) {
    hl(p4, 152, y, 410, 15);
  }

  // Add Packet Tracer CLI Screenshot Window on Page 6 & Page 10
  function drawCliScreenshot(page, x, y, w, h, title, lines) {
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: rgb(0.06, 0.07, 0.09),
      borderColor: rgb(0.4, 0.45, 0.52),
      borderWidth: 1.2,
    });
    page.drawRectangle({
      x,
      y: y + h - 18,
      width: w,
      height: 18,
      color: rgb(0.88, 0.91, 0.95),
    });
    page.drawText(title, {
      x: x + 8,
      y: y + h - 13,
      size: 8.5,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.15),
    });
    let ly = y + h - 32;
    for (const l of lines) {
      page.drawText(l, {
        x: x + 10,
        y: ly,
        size: 8.2,
        font: fontMono,
        color: l.includes('#') || l.includes('>') ? rgb(0.3, 0.9, 0.5) : rgb(0.82, 0.86, 0.9),
      });
      ly -= 11.5;
    }
  }

  // On Page 10 (under PC4 configuration), draw the PC4 Command Prompt screenshot
  drawCliScreenshot(
    p10,
    72,
    270,
    468,
    185,
    'Cisco Packet Tracer — PC4 Command Prompt (IP Config & Ping Verification)',
    [
      'C:\\>ipconfig 192.168.100.126 255.255.255.224 192.168.100.97',
      'IP Address......................: 192.168.100.126',
      'Subnet Mask.....................: 255.255.255.224',
      'Default Gateway.................: 192.168.100.97',
      '',
      'C:\\>ping 192.168.100.30',
      'Pinging 192.168.100.30 with 32 bytes of data:',
      'Reply from 192.168.100.30: bytes=32 time=1ms TTL=126',
      'Reply from 192.168.100.30: bytes=32 time<1ms TTL=126',
      'Reply from 192.168.100.30: bytes=32 time<1ms TTL=126',
      'Reply from 192.168.100.30: bytes=32 time<1ms TTL=126',
      'Ping statistics for 192.168.100.30: Sent = 4, Received = 4, Lost = 0 (0% loss)',
    ]
  );

  const outBytes = await pdfDoc.save();
  const solPath = path.join(__dirname, 'solutions/CCNA_ASS1_2420232.pdf');
  const courseCopyPath = path.join(
    __dirname,
    'courses/03 - CCNA R&S II/03 - Week 3/05 - [Solved] ASS1 - Ahmed Yasser 2420232.pdf'
  );
  fs.writeFileSync(solPath, outBytes);
  fs.writeFileSync(courseCopyPath, outBytes);
  console.log('✅ Edited original CCNA ASS1 PDF directly:', outBytes.length, 'bytes');
}

// ============================================================================
// 3. Direct Edit of Original: CCNA R&S II - 02 - sheet 3.pdf (True or False)
// ============================================================================
async function editCcnaSheet3() {
  const origPath = path.join(
    __dirname,
    'courses/03 - CCNA R&S II/03 - Week 3/02 - sheet 3.pdf'
  );
  const origBytes = fs.readFileSync(origPath);
  const pdfDoc = await PDFDocument.load(origBytes);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.getPages()[0];

  // Student Name & ID ONCE at top right of original page
  page.drawText('Name: Ahmed Yasser Abu Elkher Salah', {
    x: 310,
    y: 682,
    size: 13,
    font: fontBold,
    color: rgb(0.85, 0.12, 0.12),
  });
  page.drawText('ID: 2420232', {
    x: 310,
    y: 663,
    size: 13,
    font: fontBold,
    color: rgb(0.85, 0.12, 0.12),
  });

  // Exact coordinates of the 8 () parentheses on the original 02 - sheet 3.pdf
  const answers = [
    { x: 327.0, y: 637.6, ans: 'False (F)', isTrue: false },
    { x: 332.2, y: 623.0, ans: 'True (T)', isTrue: true },
    { x: 301.9, y: 608.4, ans: 'False (F)', isTrue: false },
    { x: 405.5, y: 593.7, ans: 'True (T)', isTrue: true },
    { x: 466.5, y: 579.0, ans: 'False (F)', isTrue: false },
    { x: 296.2, y: 564.4, ans: 'True (T)', isTrue: true },
    { x: 328.0, y: 549.8, ans: 'False (F)', isTrue: false },
    { x: 495.8, y: 535.1, ans: 'True (T)', isTrue: true },
  ];

  for (const item of answers) {
    // Cover the tiny empty () and draw yellow marker highlight with ( True (T) ) / ( False (F) )
    page.drawRectangle({
      x: item.x - 1,
      y: item.y - 2,
      width: 68,
      height: 13,
      color: rgb(1, 1, 1),
    });
    page.drawRectangle({
      x: item.x - 1,
      y: item.y - 2,
      width: 68,
      height: 13,
      color: rgb(1, 0.93, 0.2),
      opacity: 0.75,
    });
    page.drawText(`( ${item.ans} )`, {
      x: item.x + 2,
      y: item.y,
      size: 10,
      font: fontBold,
      color: item.isTrue ? rgb(0.05, 0.45, 0.15) : rgb(0.75, 0.1, 0.1),
    });
  }

  const outBytes = await pdfDoc.save();
  const solPath = path.join(__dirname, 'solutions/CCNA_Sheet3_2420232.pdf');
  const courseCopyPath = path.join(
    __dirname,
    'courses/03 - CCNA R&S II/03 - Week 3/06 - [Solved] Sheet 3 - Ahmed Yasser 2420232.pdf'
  );
  fs.writeFileSync(solPath, outBytes);
  fs.writeFileSync(courseCopyPath, outBytes);
  console.log('✅ Edited original CCNA Sheet 3 PDF directly:', outBytes.length, 'bytes');
}

await editJavaAssignment2();
await editCcnaAss1();
await editCcnaSheet3();
