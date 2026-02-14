// ═══════════════════════════════════════════════════════════════
// LeadFlow24 Backend API Server
// ═══════════════════════════════════════════════════════════════
// 
// SETUP:
//   npm install express better-sqlite3 cors helmet nodemailer dotenv uuid
//   node server.js
//
// ENV VARIABLES (.env file):
//   PORT=3000
//   SMTP_HOST=smtp.office365.com
//   SMTP_PORT=587
//   SMTP_USER=luke@leadflow24.com
//   SMTP_PASS=your_app_password
//   NOTIFICATION_EMAIL=luke@leadflow24.com
//   NOTIFICATION_PHONE=+17801234567
//   WHOP_API_KEY=your_whop_api_key
//   WHOP_WEBHOOK_SECRET=your_webhook_secret
//   FACEBOOK_PIXEL_TOKEN=xxxxx
//   JWT_SECRET=your_jwt_secret_here
//   BASE_URL=https://leadflow24.com
//   WEBHOOK_SECRET=your_webhook_secret
//
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ───
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── DATABASE SETUP ───
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, 'leadflow24.db'));

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  -- Subscribers (email opt-in from website)
  CREATE TABLE IF NOT EXISTS subscribers (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    source TEXT DEFAULT 'website',
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Trial Signups (from free trial page)
  CREATE TABLE IF NOT EXISTS trial_signups (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    business_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    industry TEXT NOT NULL,
    city TEXT NOT NULL,
    source TEXT DEFAULT 'free_trial_page',
    status TEXT DEFAULT 'new',
    notes TEXT,
    assigned_to TEXT,
    follow_up_date DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Clients (converted trial signups or direct clients)
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    trial_id TEXT REFERENCES trial_signups(id),
    business_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    industry TEXT NOT NULL,
    city TEXT NOT NULL,
    service_area TEXT,
    services_offered TEXT,
    avg_job_value REAL,
    plan TEXT DEFAULT 'starter',
    plan_price REAL DEFAULT 397,
    status TEXT DEFAULT 'active',
    dashboard_token TEXT UNIQUE,
    whop_membership_id TEXT,
    whop_user_id TEXT,
    onboarded_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Leads (captured from landing pages)
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    client_id TEXT REFERENCES clients(id),
    capture_page TEXT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT NOT NULL,
    service_needed TEXT,
    address TEXT,
    city TEXT,
    postal_code TEXT,
    message TEXT,
    source TEXT DEFAULT 'facebook',
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    status TEXT DEFAULT 'new',
    contacted_at DATETIME,
    booked_at DATETIME,
    job_value REAL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Lead Activity Log
  CREATE TABLE IF NOT EXISTS lead_activity (
    id TEXT PRIMARY KEY,
    lead_id TEXT REFERENCES leads(id),
    action TEXT NOT NULL,
    details TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Capture Pages
  CREATE TABLE IF NOT EXISTS capture_pages (
    id TEXT PRIMARY KEY,
    client_id TEXT REFERENCES clients(id),
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    industry TEXT,
    city TEXT,
    status TEXT DEFAULT 'active',
    views INTEGER DEFAULT 0,
    submissions INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Email Log
  CREATE TABLE IF NOT EXISTS email_log (
    id TEXT PRIMARY KEY,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    template TEXT,
    status TEXT DEFAULT 'sent',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_leads_client ON leads(client_id);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
  CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
  CREATE INDEX IF NOT EXISTS idx_trial_status ON trial_signups(status);
  CREATE INDEX IF NOT EXISTS idx_clients_token ON clients(dashboard_token);
  CREATE INDEX IF NOT EXISTS idx_capture_slug ON capture_pages(slug);
`);

// ─── EMAIL SERVICE ───
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.office365.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendEmail(to, subject, html, text) {
  try {
    const info = await transporter.sendMail({
      from: `"LeadFlow24" <${process.env.SMTP_USER || 'luke@leadflow24.com'}>`,
      to,
      subject,
      html,
      text: text || subject,
    });

    db.prepare('INSERT INTO email_log (id, recipient, subject, template, status) VALUES (?, ?, ?, ?, ?)').run(
      uuidv4(), to, subject, 'custom', 'sent'
    );

    return info;
  } catch (err) {
    console.error('Email send failed:', err.message);
    db.prepare('INSERT INTO email_log (id, recipient, subject, template, status) VALUES (?, ?, ?, ?, ?)').run(
      uuidv4(), to, subject, 'custom', 'failed'
    );
    return null;
  }
}

// ─── EMAIL TEMPLATES ───
function getEmailTemplate(type, data) {
  const templates = {
    trial_welcome: {
      subject: `Welcome to LeadFlow24, ${data.firstName}! Your trial starts now.`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#0A2540;color:white;border-radius:12px;overflow:hidden;">
          <div style="background:#0F172A;padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-weight:800;font-size:18px;color:white;">LeadFlow<span style="color:#0066FF;">24</span></span>
          </div>
          <div style="padding:32px;">
            <div style="background:rgba(197,164,78,0.1);border:1px solid rgba(197,164,78,0.2);border-radius:8px;padding:10px 16px;margin-bottom:24px;display:inline-block;">
              <span style="color:#C5A44E;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">🛡️ 14-Day Free Trial Active</span>
            </div>
            <h1 style="font-size:24px;margin-bottom:12px;color:white;">Hey ${data.firstName}, you're in.</h1>
            <p style="color:rgba(255,255,255,0.5);font-size:14px;line-height:1.65;margin-bottom:24px;">
              We're building your campaign right now. Here's what happens next:
            </p>
            <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:20px;margin-bottom:24px;">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                <div style="width:28px;height:28px;border-radius:50%;background:rgba(0,102,255,0.15);color:#0066FF;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">1</div>
                <span style="color:rgba(255,255,255,0.6);font-size:13px;"><strong style="color:white;">Within 24 hours</strong> — We'll call to confirm your service area and details</span>
              </div>
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                <div style="width:28px;height:28px;border-radius:50%;background:rgba(0,102,255,0.15);color:#0066FF;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">2</div>
                <span style="color:rgba(255,255,255,0.6);font-size:13px;"><strong style="color:white;">Within 48 hours</strong> — Your landing page and ads go live</span>
              </div>
              <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:28px;height:28px;border-radius:50%;background:rgba(16,185,129,0.15);color:#10B981;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">3</div>
                <span style="color:rgba(255,255,255,0.6);font-size:13px;"><strong style="color:white;">Days 3-14</strong> — Leads start hitting your phone</span>
              </div>
            </div>
            <p style="color:rgba(255,255,255,0.35);font-size:12px;line-height:1.6;">
              We're funding the ad spend for your trial — you risk nothing. If the leads aren't good, walk away. No contracts, no commitments.
            </p>
            <p style="color:rgba(255,255,255,0.35);font-size:12px;margin-top:16px;">
              Questions? Reply to this email or call us directly.<br>
              — The LeadFlow24 Team
            </p>
          </div>
        </div>
      `
    },

    new_lead_notification: {
      subject: `🔔 New Lead: ${data.leadName} needs ${data.serviceNeeded}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#0A2540;color:white;border-radius:12px;overflow:hidden;">
          <div style="background:#0F172A;padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-weight:800;font-size:18px;color:white;">LeadFlow<span style="color:#0066FF;">24</span></span>
          </div>
          <div style="padding:32px;">
            <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);border-radius:8px;padding:10px 16px;margin-bottom:24px;display:inline-block;">
              <span style="color:#10B981;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">⚡ New Lead — Call Now</span>
            </div>
            <h1 style="font-size:22px;margin-bottom:8px;color:white;">New lead just came in.</h1>
            <p style="color:rgba(255,255,255,0.5);font-size:14px;margin-bottom:20px;">Speed matters — call within 5 minutes for the best close rate.</p>
            <div style="background:rgba(255,255,255,0.04);border-radius:10px;padding:20px;border:1px solid rgba(255,255,255,0.06);">
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="color:rgba(255,255,255,0.35);font-size:11px;text-transform:uppercase;letter-spacing:0.06em;padding:6px 0;">Name</td><td style="color:white;font-weight:600;font-size:14px;padding:6px 0;">${data.leadName}</td></tr>
                <tr><td style="color:rgba(255,255,255,0.35);font-size:11px;text-transform:uppercase;letter-spacing:0.06em;padding:6px 0;">Phone</td><td style="color:#0066FF;font-weight:700;font-size:16px;padding:6px 0;"><a href="tel:${data.phone}" style="color:#0066FF;text-decoration:none;">${data.phone}</a></td></tr>
                <tr><td style="color:rgba(255,255,255,0.35);font-size:11px;text-transform:uppercase;letter-spacing:0.06em;padding:6px 0;">Service</td><td style="color:white;font-size:14px;padding:6px 0;">${data.serviceNeeded}</td></tr>
                <tr><td style="color:rgba(255,255,255,0.35);font-size:11px;text-transform:uppercase;letter-spacing:0.06em;padding:6px 0;">Location</td><td style="color:white;font-size:14px;padding:6px 0;">${data.city || 'Edmonton area'}</td></tr>
                ${data.message ? `<tr><td style="color:rgba(255,255,255,0.35);font-size:11px;text-transform:uppercase;letter-spacing:0.06em;padding:6px 0;">Message</td><td style="color:rgba(255,255,255,0.6);font-size:13px;padding:6px 0;">${data.message}</td></tr>` : ''}
              </table>
            </div>
            <a href="tel:${data.phone}" style="display:block;text-align:center;background:#0066FF;color:white;padding:14px;border-radius:8px;font-weight:700;font-size:15px;margin-top:20px;text-decoration:none;">📞 Call ${data.leadName} Now</a>
          </div>
        </div>
      `
    },

    internal_notification: {
      subject: `[LeadFlow24] ${data.type}: ${data.summary}`,
      html: `
        <div style="font-family:monospace;max-width:600px;margin:0 auto;background:#0F172A;color:white;padding:24px;border-radius:8px;">
          <div style="border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:12px;margin-bottom:16px;">
            <strong style="color:#C5A44E;">[${data.type.toUpperCase()}]</strong> <span style="color:rgba(255,255,255,0.5);">${new Date().toISOString()}</span>
          </div>
          <pre style="color:rgba(255,255,255,0.7);font-size:13px;line-height:1.6;white-space:pre-wrap;">${JSON.stringify(data.details, null, 2)}</pre>
        </div>
      `
    },

    weekly_report: {
      subject: `📊 Your Weekly Lead Report — ${data.businessName}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#0A2540;color:white;border-radius:12px;overflow:hidden;">
          <div style="background:#0F172A;padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-weight:800;font-size:18px;color:white;">LeadFlow<span style="color:#0066FF;">24</span></span>
            <span style="float:right;color:rgba(255,255,255,0.3);font-size:12px;">Weekly Report</span>
          </div>
          <div style="padding:32px;">
            <h1 style="font-size:22px;margin-bottom:20px;">This week's numbers, ${data.contactName}.</h1>
            <div style="display:flex;gap:12px;margin-bottom:24px;">
              <div style="flex:1;background:rgba(0,102,255,0.08);border-radius:10px;padding:16px;text-align:center;">
                <div style="font-family:monospace;font-size:28px;font-weight:700;color:#0066FF;">${data.leadsThisWeek}</div>
                <div style="font-size:10px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">New Leads</div>
              </div>
              <div style="flex:1;background:rgba(16,185,129,0.08);border-radius:10px;padding:16px;text-align:center;">
                <div style="font-family:monospace;font-size:28px;font-weight:700;color:#10B981;">${data.jobsBooked}</div>
                <div style="font-size:10px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">Jobs Booked</div>
              </div>
              <div style="flex:1;background:rgba(197,164,78,0.08);border-radius:10px;padding:16px;text-align:center;">
                <div style="font-family:monospace;font-size:28px;font-weight:700;color:#C5A44E;">$${data.revenue}</div>
                <div style="font-size:10px;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.06em;margin-top:4px;">Revenue</div>
              </div>
            </div>
            <a href="${process.env.BASE_URL || 'https://leadflow24.com'}/dashboard" style="display:block;text-align:center;background:#0066FF;color:white;padding:14px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;">View Full Dashboard →</a>
            <p style="color:rgba(255,255,255,0.3);font-size:11px;margin-top:20px;text-align:center;">
              Every lead. Every dollar. Tracked. — LeadFlow24
            </p>
          </div>
        </div>
      `
    }
  };

  return templates[type] || null;
}


// ═══════════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════════

// ─── HEALTH CHECK ───
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});


// ─── EMAIL SUBSCRIPTION ───
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email, source } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const id = uuidv4();
    const stmt = db.prepare('INSERT OR IGNORE INTO subscribers (id, email, source) VALUES (?, ?, ?)');
    stmt.run(id, email.toLowerCase().trim(), source || 'website');

    // Send internal notification
    await sendEmail(
      process.env.NOTIFICATION_EMAIL || 'luke@leadflow24.com',
      `[LeadFlow24] New subscriber: ${email}`,
      getEmailTemplate('internal_notification', {
        type: 'New Subscriber',
        summary: email,
        details: { email, source, timestamp: new Date().toISOString() }
      }).html
    );

    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ error: 'Subscription failed' });
  }
});


// ─── TRIAL SIGNUP ───
app.post('/api/trial-signup', async (req, res) => {
  try {
    const { firstName, lastName, businessName, email, phone, industry, city, source } = req.body;

    if (!firstName || !email || !phone) {
      return res.status(400).json({ error: 'First name, email, and phone required' });
    }

    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO trial_signups (id, first_name, last_name, business_name, email, phone, industry, city, source, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
    `);
    stmt.run(id, firstName, lastName, businessName, email.toLowerCase().trim(), phone, industry, city, source || 'free_trial_page');

    // Also add as subscriber
    db.prepare('INSERT OR IGNORE INTO subscribers (id, email, source) VALUES (?, ?, ?)').run(
      uuidv4(), email.toLowerCase().trim(), 'trial_signup'
    );

    // Send welcome email to prospect
    const welcomeEmail = getEmailTemplate('trial_welcome', { firstName });
    if (welcomeEmail) {
      await sendEmail(email, welcomeEmail.subject, welcomeEmail.html);
    }

    // Send internal notification
    await sendEmail(
      process.env.NOTIFICATION_EMAIL || 'luke@leadflow24.com',
      `🚀 NEW TRIAL SIGNUP: ${businessName} (${industry}) — ${city}`,
      getEmailTemplate('internal_notification', {
        type: 'Trial Signup',
        summary: `${firstName} ${lastName} — ${businessName}`,
        details: { firstName, lastName, businessName, email, phone, industry, city, source, timestamp: new Date().toISOString() }
      }).html
    );

    res.json({ success: true, id, message: 'Trial signup successful' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email already registered for a trial' });
    }
    console.error('Trial signup error:', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});


// ─── LEAD CAPTURE (from landing pages) ───
app.post('/api/leads', async (req, res) => {
  try {
    const { name, email, phone, service_needed, address, city, postal_code, message, source, utm_source, utm_medium, utm_campaign, capture_page } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone required' });
    }

    // Find the client associated with this capture page
    let clientId = null;
    if (capture_page) {
      const page = db.prepare('SELECT client_id FROM capture_pages WHERE slug = ?').get(capture_page);
      if (page) clientId = page.client_id;
    }

    const id = uuidv4();
    const stmt = db.prepare(`
      INSERT INTO leads (id, client_id, capture_page, name, email, phone, service_needed, address, city, postal_code, message, source, utm_source, utm_medium, utm_campaign, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')
    `);
    stmt.run(id, clientId, capture_page, name, email, phone, service_needed, address, city, postal_code, message, source || 'facebook', utm_source, utm_medium, utm_campaign);

    // Update capture page stats
    if (capture_page) {
      db.prepare('UPDATE capture_pages SET submissions = submissions + 1 WHERE slug = ?').run(capture_page);
    }

    // Log activity
    db.prepare('INSERT INTO lead_activity (id, lead_id, action, details) VALUES (?, ?, ?, ?)').run(
      uuidv4(), id, 'created', JSON.stringify({ source, capture_page })
    );

    // Notify client if assigned
    if (clientId) {
      const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
      if (client) {
        const leadEmail = getEmailTemplate('new_lead_notification', {
          leadName: name,
          phone,
          serviceNeeded: service_needed || 'Service request',
          city: city || 'Local area',
          message
        });
        await sendEmail(client.email, leadEmail.subject, leadEmail.html);
      }
    }

    // Always notify operator
    await sendEmail(
      process.env.NOTIFICATION_EMAIL || 'luke@leadflow24.com',
      `⚡ NEW LEAD: ${name} — ${service_needed || 'Service request'} (${capture_page || 'direct'})`,
      getEmailTemplate('internal_notification', {
        type: 'New Lead',
        summary: `${name} — ${phone}`,
        details: { id, name, email, phone, service_needed, city, capture_page, source, timestamp: new Date().toISOString() }
      }).html
    );

    res.json({ success: true, id, message: 'Lead captured successfully' });
  } catch (err) {
    console.error('Lead capture error:', err);
    res.status(500).json({ error: 'Lead capture failed' });
  }
});


// ─── LEAD STATUS UPDATE ───
app.patch('/api/leads/:id', (req, res) => {
  try {
    const { status, notes, job_value, contacted_at, booked_at } = req.body;
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const updates = [];
    const values = [];

    if (status) { updates.push('status = ?'); values.push(status); }
    if (notes !== undefined) { updates.push('notes = ?'); values.push(notes); }
    if (job_value !== undefined) { updates.push('job_value = ?'); values.push(job_value); }
    if (contacted_at) { updates.push('contacted_at = ?'); values.push(contacted_at); }
    if (booked_at) { updates.push('booked_at = ?'); values.push(booked_at); }
    updates.push('updated_at = CURRENT_TIMESTAMP');

    db.prepare(`UPDATE leads SET ${updates.join(', ')} WHERE id = ?`).run(...values, req.params.id);

    // Log activity
    db.prepare('INSERT INTO lead_activity (id, lead_id, action, details) VALUES (?, ?, ?, ?)').run(
      uuidv4(), req.params.id, 'status_updated', JSON.stringify({ status, notes, job_value })
    );

    res.json({ success: true, message: 'Lead updated' });
  } catch (err) {
    console.error('Lead update error:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});


// ─── DASHBOARD API ───

// Get dashboard stats for a client
app.get('/api/dashboard/:token', (req, res) => {
  try {
    const client = db.prepare('SELECT * FROM clients WHERE dashboard_token = ?').get(req.params.token);
    if (!client) return res.status(404).json({ error: 'Dashboard not found' });

    const leads = db.prepare('SELECT * FROM leads WHERE client_id = ? ORDER BY created_at DESC').all(client.id);
    const totalLeads = leads.length;
    const newLeads = leads.filter(l => l.status === 'new').length;
    const contactedLeads = leads.filter(l => l.status === 'contacted').length;
    const bookedLeads = leads.filter(l => l.status === 'booked').length;
    const totalRevenue = leads.reduce((sum, l) => sum + (l.job_value || 0), 0);
    const closeRate = totalLeads > 0 ? ((bookedLeads / totalLeads) * 100).toFixed(1) : 0;

    // Weekly breakdown
    const now = new Date();
    const weeklyLeads = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (i * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const count = leads.filter(l => {
        const d = new Date(l.created_at);
        return d >= weekStart && d < weekEnd;
      }).length;
      weeklyLeads.push({ week: `W${4 - i}`, count });
    }

    res.json({
      client: {
        businessName: client.business_name,
        plan: client.plan,
        industry: client.industry,
        city: client.city,
      },
      stats: {
        totalLeads,
        newLeads,
        contactedLeads,
        bookedLeads,
        totalRevenue,
        closeRate,
        costPerLead: totalLeads > 0 ? (client.plan_price / totalLeads).toFixed(0) : 0,
      },
      weeklyLeads,
      recentLeads: leads.slice(0, 20).map(l => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        serviceNeeded: l.service_needed,
        city: l.city,
        status: l.status,
        jobValue: l.job_value,
        createdAt: l.created_at,
      })),
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Dashboard load failed' });
  }
});


// ─── ADMIN API ───

// List all trial signups
app.get('/api/admin/trials', (req, res) => {
  const trials = db.prepare('SELECT * FROM trial_signups ORDER BY created_at DESC').all();
  res.json({ trials });
});

// List all subscribers
app.get('/api/admin/subscribers', (req, res) => {
  const subscribers = db.prepare('SELECT * FROM subscribers ORDER BY created_at DESC').all();
  res.json({ subscribers, total: subscribers.length });
});

// List all leads with optional filters
app.get('/api/admin/leads', (req, res) => {
  const { client_id, status, limit } = req.query;
  let query = 'SELECT * FROM leads';
  const conditions = [];
  const values = [];

  if (client_id) { conditions.push('client_id = ?'); values.push(client_id); }
  if (status) { conditions.push('status = ?'); values.push(status); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY created_at DESC';
  if (limit) query += ` LIMIT ${parseInt(limit)}`;

  const leads = db.prepare(query).all(...values);
  res.json({ leads, total: leads.length });
});

// List all clients
app.get('/api/admin/clients', (req, res) => {
  const clients = db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
  res.json({ clients });
});

// Create a new client (from trial conversion or manual)
app.post('/api/admin/clients', (req, res) => {
  try {
    const { trial_id, business_name, contact_name, email, phone, industry, city, service_area, services_offered, avg_job_value, plan, plan_price } = req.body;

    const id = uuidv4();
    const dashboardToken = uuidv4().replace(/-/g, '').substring(0, 24);

    db.prepare(`
      INSERT INTO clients (id, trial_id, business_name, contact_name, email, phone, industry, city, service_area, services_offered, avg_job_value, plan, plan_price, dashboard_token, onboarded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(id, trial_id, business_name, contact_name, email, phone, industry, city, service_area, services_offered, avg_job_value, plan || 'starter', plan_price || 397, dashboardToken);

    // Update trial status if converting
    if (trial_id) {
      db.prepare('UPDATE trial_signups SET status = ? WHERE id = ?').run('converted', trial_id);
    }

    res.json({
      success: true,
      client: { id, dashboardToken },
      dashboardUrl: `${process.env.BASE_URL || 'https://leadflow24.com'}/dashboard?token=${dashboardToken}`
    });
  } catch (err) {
    console.error('Client creation error:', err);
    res.status(500).json({ error: 'Client creation failed' });
  }
});

// Create a capture page for a client
app.post('/api/admin/capture-pages', (req, res) => {
  try {
    const { client_id, slug, title, industry, city } = req.body;
    const id = uuidv4();

    db.prepare(`
      INSERT INTO capture_pages (id, client_id, slug, title, industry, city)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, client_id, slug, title, industry, city);

    res.json({ success: true, id, url: `${process.env.BASE_URL || 'https://leadflow24.com'}/quote/${slug}` });
  } catch (err) {
    console.error('Capture page creation error:', err);
    res.status(500).json({ error: 'Creation failed' });
  }
});

// Track capture page view
app.post('/api/capture-pages/:slug/view', (req, res) => {
  db.prepare('UPDATE capture_pages SET views = views + 1 WHERE slug = ?').run(req.params.slug);
  res.json({ success: true });
});

// Get dashboard overview (admin)
app.get('/api/admin/overview', (req, res) => {
  const totalSubscribers = db.prepare('SELECT COUNT(*) as count FROM subscribers').get().count;
  const totalTrials = db.prepare('SELECT COUNT(*) as count FROM trial_signups').get().count;
  const activeTrials = db.prepare("SELECT COUNT(*) as count FROM trial_signups WHERE status = 'new' OR status = 'active'").get().count;
  const totalClients = db.prepare('SELECT COUNT(*) as count FROM clients').get().count;
  const totalLeads = db.prepare('SELECT COUNT(*) as count FROM leads').get().count;
  const totalRevenue = db.prepare('SELECT SUM(job_value) as total FROM leads WHERE job_value IS NOT NULL').get().total || 0;
  const todayLeads = db.prepare("SELECT COUNT(*) as count FROM leads WHERE date(created_at) = date('now')").get().count;

  res.json({
    subscribers: totalSubscribers,
    trials: { total: totalTrials, active: activeTrials },
    clients: totalClients,
    leads: { total: totalLeads, today: todayLeads },
    revenue: totalRevenue,
  });
});


// ─── WEBHOOK ENDPOINTS ───

// Facebook Lead Ads webhook
app.post('/api/webhooks/facebook', async (req, res) => {
  try {
    const { entry } = req.body;
    if (!entry) return res.status(400).json({ error: 'Invalid webhook data' });

    for (const e of entry) {
      for (const change of (e.changes || [])) {
        if (change.field === 'leadgen') {
          const leadData = change.value;
          // Process Facebook lead — you'd normally fetch full details from FB API here
          console.log('Facebook lead webhook:', leadData);
        }
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Facebook webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Facebook webhook verification
app.get('/api/webhooks/facebook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WEBHOOK_SECRET) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Zapier webhook (for integrations)
app.post('/api/webhooks/zapier', async (req, res) => {
  try {
    const data = req.body;
    console.log('Zapier webhook received:', data);

    // Process based on event type
    if (data.event === 'new_lead') {
      // Forward to lead capture
      const response = await fetch(`http://localhost:${PORT}/api/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.lead),
      });
    }

    res.json({ success: true, received: true });
  } catch (err) {
    console.error('Zapier webhook error:', err);
    res.status(500).json({ error: 'Webhook failed' });
  }
});

// Whop webhook (payment & membership events)
app.post('/api/webhooks/whop', express.json(), async (req, res) => {
  try {
    const { action, data } = req.body;
    console.log(`Whop webhook: ${action}`);

    // Verify webhook secret if configured
    const whopSecret = process.env.WHOP_WEBHOOK_SECRET;
    if (whopSecret && req.headers['whop-signature'] !== whopSecret) {
      console.warn('Invalid Whop webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    switch (action) {
      case 'payment.succeeded': {
        const email = data.user?.email;
        const planId = data.plan?.id;
        const amount = data.plan?.initial_price || data.plan?.renewal_price;
        console.log(`Payment succeeded: ${email}, plan: ${planId}, amount: $${amount}`);

        // Update client status if they exist
        if (email) {
          db.prepare(`
            UPDATE clients SET status = 'active', 
            whop_membership_id = ?, whop_user_id = ?,
            updated_at = CURRENT_TIMESTAMP 
            WHERE email = ?
          `).run(data.membership || null, data.user?.id || null, email);
        }

        // Send notification
        await sendEmail(
          process.env.NOTIFICATION_EMAIL || 'luke@leadflow24.com',
          `💰 New Payment: $${amount} from ${email}`,
          `<h2>Payment Received!</h2>
           <p><strong>Customer:</strong> ${data.user?.username || email}</p>
           <p><strong>Email:</strong> ${email}</p>
           <p><strong>Amount:</strong> $${amount}</p>
           <p><strong>Plan:</strong> ${data.plan?.plan_type || 'N/A'}</p>
           <p><strong>Membership:</strong> ${data.membership || 'N/A'}</p>`
        );
        break;
      }

      case 'membership.went_valid': {
        const email = data.user?.email;
        console.log(`Membership valid: ${email}`);
        if (email) {
          db.prepare(`
            UPDATE clients SET status = 'active',
            whop_membership_id = ?, whop_user_id = ?,
            updated_at = CURRENT_TIMESTAMP 
            WHERE email = ?
          `).run(data.id || null, data.user?.id || null, email);
        }
        break;
      }

      case 'membership.went_invalid': {
        const email = data.user?.email;
        console.log(`Membership invalid: ${email}`);
        if (email) {
          db.prepare(`
            UPDATE clients SET status = 'churned', updated_at = CURRENT_TIMESTAMP WHERE email = ?
          `).run(email);
        }

        await sendEmail(
          process.env.NOTIFICATION_EMAIL || 'luke@leadflow24.com',
          `⚠️ Membership Cancelled: ${email}`,
          `<h2>Client Membership Ended</h2>
           <p><strong>Email:</strong> ${email}</p>
           <p><strong>Membership:</strong> ${data.id || 'N/A'}</p>
           <p>Check Whop dashboard for details.</p>`
        );
        break;
      }

      case 'payment.failed': {
        const email = data.user?.email;
        console.log(`Payment failed: ${email}`);
        await sendEmail(
          process.env.NOTIFICATION_EMAIL || 'luke@leadflow24.com',
          `❌ Payment Failed: ${email}`,
          `<h2>Payment Failed</h2>
           <p><strong>Email:</strong> ${email}</p>
           <p>Whop will retry automatically. Monitor in your Whop dashboard.</p>`
        );
        break;
      }

      default:
        console.log(`Unhandled Whop event: ${action}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Whop webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});


// ─── SERVE STATIC PAGES ───

// Serve capture pages dynamically
app.get('/quote/:slug', (req, res) => {
  const page = db.prepare('SELECT * FROM capture_pages WHERE slug = ? AND status = ?').get(req.params.slug, 'active');
  if (!page) return res.status(404).send('Page not found');

  // Increment view count
  db.prepare('UPDATE capture_pages SET views = views + 1 WHERE slug = ?').run(req.params.slug);

  // Serve the capture page template
  res.sendFile(path.join(__dirname, 'public', 'capture-page.html'));
});

// Serve main pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/free-trial', (req, res) => res.sendFile(path.join(__dirname, 'public', 'free-trial.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));


// ─── FRONTEND ROUTES ───
// Serve trial page
app.get('/trial', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trial.html'));
});

// Serve capture pages: /quote/:industry/:city
app.get('/quote/:industry/:city', (req, res) => {
  const { industry, city } = req.params;
  const filePath = path.join(__dirname, 'public', 'quote', industry, `${city}.html`);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
  });
});

// Catch-all: serve main site
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ─── START SERVER ───
app.listen(PORT, () => {
  console.log(`
  ═══════════════════════════════════════════
   LeadFlow24 API Server
   Running on port ${PORT}
   Database: leadflow24.db
  ═══════════════════════════════════════════
  
  Endpoints:
    POST /api/subscribe          — Email opt-in
    POST /api/trial-signup       — Free trial form
    POST /api/leads              — Lead capture
    PATCH /api/leads/:id         — Update lead status
    GET  /api/dashboard/:token   — Client dashboard data
    GET  /api/admin/overview     — Admin stats
    GET  /api/admin/trials       — List trial signups
    GET  /api/admin/subscribers  — List subscribers
    GET  /api/admin/leads        — List leads
    GET  /api/admin/clients      — List clients
    POST /api/admin/clients      — Create client
    POST /api/admin/capture-pages — Create capture page
    POST /api/webhooks/facebook  — FB Lead Ads webhook
    POST /api/webhooks/zapier    — Zapier integration
    POST /api/webhooks/whop      — Whop payments & memberships
  `);
});

module.exports = app;
