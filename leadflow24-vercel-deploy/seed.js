// ═══════════════════════════════════════════
// LeadFlow24 Database Seed
// Run: node seed.js
// ═══════════════════════════════════════════

const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const db = new Database(path.join(__dirname, 'leadflow24.db'));

console.log('🌱 Seeding LeadFlow24 database...\n');

// Demo client
const clientId = uuidv4();
const dashboardToken = 'demo_' + uuidv4().replace(/-/g, '').substring(0, 20);

db.prepare(`
  INSERT OR IGNORE INTO clients (id, business_name, contact_name, email, phone, industry, city, service_area, services_offered, avg_job_value, plan, plan_price, dashboard_token, status, onboarded_at)
  VALUES (?, 'Edmonton Pro HVAC', 'Mike Johnson', 'mike@edmontonprohvac.ca', '(780) 555-0123', 'hvac', 'Edmonton', 'Edmonton, St. Albert, Sherwood Park', 'Furnace install, AC repair, Duct cleaning', 3200, 'growth', 597, ?, 'active', datetime('now', '-14 days'))
`).run(clientId, dashboardToken);

// Demo capture page
db.prepare(`
  INSERT OR IGNORE INTO capture_pages (id, client_id, slug, title, industry, city, views, submissions)
  VALUES (?, ?, 'hvac-edmonton-demo', 'Edmonton HVAC Services', 'hvac', 'Edmonton', 847, 23)
`).run(uuidv4(), clientId);

// Demo leads
const demoLeads = [
  { name: 'Sarah Mitchell', phone: '(780) 555-0201', service: 'Furnace install', city: 'Windermere', status: 'booked', value: 4200, daysAgo: 1 },
  { name: 'David Chen', phone: '(780) 555-0202', service: 'AC repair', city: 'Millwoods', status: 'contacted', value: null, daysAgo: 1 },
  { name: 'Lisa Park', phone: '(780) 555-0203', service: 'Duct cleaning', city: 'St. Albert', status: 'booked', value: 890, daysAgo: 2 },
  { name: 'James Torres', phone: '(780) 555-0204', service: 'Furnace repair', city: 'Sherwood Park', status: 'new', value: null, daysAgo: 0 },
  { name: 'Maria Rodriguez', phone: '(780) 555-0205', service: 'AC install', city: 'Summerside', status: 'booked', value: 5800, daysAgo: 3 },
  { name: 'Kevin Wright', phone: '(780) 555-0206', service: 'Thermostat replacement', city: 'Beaumont', status: 'contacted', value: null, daysAgo: 2 },
  { name: 'Amanda Foster', phone: '(780) 555-0207', service: 'Furnace maintenance', city: 'Riverbend', status: 'booked', value: 320, daysAgo: 4 },
  { name: 'Robert Kim', phone: '(780) 555-0208', service: 'Heat pump install', city: 'Leduc', status: 'booked', value: 6200, daysAgo: 5 },
  { name: 'Jennifer Adams', phone: '(780) 555-0209', service: 'AC repair', city: 'Spruce Grove', status: 'no_answer', value: null, daysAgo: 3 },
  { name: 'Michael Brown', phone: '(780) 555-0210', service: 'Furnace replacement', city: 'West Edmonton', status: 'booked', value: 4800, daysAgo: 6 },
  { name: 'Patricia Lee', phone: '(780) 555-0211', service: 'Duct repair', city: 'Callingwood', status: 'contacted', value: null, daysAgo: 1 },
  { name: 'Thomas Garcia', phone: '(780) 555-0212', service: 'AC maintenance', city: 'Terwillegar', status: 'booked', value: 280, daysAgo: 7 },
  { name: 'Emily Wilson', phone: '(780) 555-0213', service: 'Hot water tank', city: 'Ellerslie', status: 'new', value: null, daysAgo: 0 },
  { name: 'Daniel Martinez', phone: '(780) 555-0214', service: 'Furnace tune-up', city: 'Castle Downs', status: 'booked', value: 180, daysAgo: 8 },
  { name: 'Ashley Taylor', phone: '(780) 555-0215', service: 'AC install quote', city: 'Jasper Place', status: 'contacted', value: null, daysAgo: 2 },
  { name: 'Chris Anderson', phone: '(780) 555-0216', service: 'Emergency furnace', city: 'Clareview', status: 'booked', value: 1200, daysAgo: 4 },
  { name: 'Rachel Thompson', phone: '(780) 555-0217', service: 'Ventilation', city: 'Lewis Estates', status: 'new', value: null, daysAgo: 0 },
  { name: 'Brian Jackson', phone: '(780) 555-0218', service: 'Furnace repair', city: 'Mill Creek', status: 'contacted', value: null, daysAgo: 1 },
  { name: 'Nicole White', phone: '(780) 555-0219', service: 'AC replacement', city: 'Glenora', status: 'booked', value: 5100, daysAgo: 9 },
  { name: 'Steven Harris', phone: '(780) 555-0220', service: 'Gas line install', city: 'Heritage Valley', status: 'booked', value: 2400, daysAgo: 10 },
  { name: 'Lauren Clark', phone: '(780) 555-0221', service: 'Furnace filter service', city: 'Rutherford', status: 'contacted', value: null, daysAgo: 3 },
  { name: 'Mark Robinson', phone: '(780) 555-0222', service: 'Heat pump quote', city: 'Windermere', status: 'new', value: null, daysAgo: 0 },
  { name: 'Sandra Lewis', phone: '(780) 555-0223', service: 'Duct cleaning', city: 'Ottewell', status: 'booked', value: 680, daysAgo: 11 },
];

const leadStmt = db.prepare(`
  INSERT INTO leads (id, client_id, capture_page, name, phone, service_needed, city, status, job_value, source, created_at)
  VALUES (?, ?, 'hvac-edmonton-demo', ?, ?, ?, ?, ?, ?, 'facebook', datetime('now', ?))
`);

demoLeads.forEach(lead => {
  leadStmt.run(
    uuidv4(), clientId,
    lead.name, lead.phone, lead.service, lead.city, lead.status, lead.value,
    `-${lead.daysAgo} days`
  );
});

console.log(`✅ Created demo client: Edmonton Pro HVAC`);
console.log(`✅ Dashboard token: ${dashboardToken}`);
console.log(`✅ Created ${demoLeads.length} demo leads`);
console.log(`\n📊 Dashboard URL: http://localhost:3000/dashboard?token=${dashboardToken}`);
console.log(`\n🌱 Seeding complete!`);

db.close();
