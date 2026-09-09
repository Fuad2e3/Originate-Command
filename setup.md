# Originate Command — Master Setup & Deployment Guide
> **সম্পূর্ণ প্রজেক্ট লোকাল পিসি (Windows) এবং VPS (Ubuntu Linux) প্রোডাকশন ডিপ্লয়মেন্টের পূর্ণাঙ্গ গাইড (Comprehensive Setup Manual)**

এই ম্যানুয়ালে Originate Command প্ল্যাটফর্মটি লোকাল কম্পিউটারে রান করা থেকে শুরু করে নতুন একটি Linux VPS সার্ভারে (Ubuntu 22.04 / 24.04 LTS) ক্লাস্টার আর্কিটেকচারে লাইভ করার প্রতিটি ধাপ প্রাতিষ্ঠানিক মানদণ্ডে বিস্তারিতভাবে উপস্থাপন করা হয়েছে।

---

## সূচিপত্র (Table of Contents)
1. [আর্কিটেকচার ও টেকনোলজি ওভারভিউ](#আর্কিটেকচার-ও-টেকনোলজি-ওভারভিউ)
2. [পার্ট ১: লোকাল পিসি (Windows) ডেভেলপমেন্ট ও রান সেটআপ](#পার্ট-১-লোকাল-পিসি-windows-ডেভেলপমেন্ট-ও-রান-সেটআপ)
3. [পার্ট ২: লিনাক্স VPS-এ সম্পূর্ণ প্রোডাকশন ডিপ্লয়মেন্ট (Step-by-Step)](#পার্ট-২-লিনাক্স-vps-এ-সম্পূর্ণ-প্রোডাকশন-ডিপ্লয়মেন্ট-step-by-step)
   - [ধাপ ১: VPS-এ প্রাথমিক প্যাকেজ ইনস্টলেশন](#ধাপ-১-vps-এ-প্রাথমিক-প্যাকেজ-ইনস্টলেশন)
   - [ধাপ ২: GitHub থেকে ফ্রন্টএন্ড রিপোজিটরি ক্লোন](#ধাপ-২-github-থেকে-ফ্রন্টএন্ড-রিপোজিটরি-ক্লোন)
   - [ধাপ ৩: লোকাল পিসি থেকে প্রাইভেট `dev3` ফোল্ডার VPS-এ আপলোড](#ধাপ-৩-লোকাল-পিসি-থেকে-প্রাইভেট-dev3-ফোল্ডার-vps-এ-আপলোড)
   - [ধাপ ৪: VPS-এ `dev3` আনপ্যাক, ডিপেনডেন্সি ও ফাইল পারমিশন](#ধাপ-৪-vps-এ-dev3-আনপ্যাক-ডিপেনডেন্সি-ও-ফাইল-পারমিশন)
   - [ধাপ ৫: MySQL ইনস্টল ও ১-ক্লিক অটো ডাটাবেজ তৈরি (`database_schema.sql`)](#ধাপ-৫-mysql-ইনস্টল-ও-১-ক্লিক-অটো-ডাটাবেজ-তৈরি-database_schemasql)
   - [ধাপ ৬: PM2 ক্লাস্টার দিয়ে মাল্টি-সার্ভার চালু করা](#ধাপ-৬-pm2-ক্লাস্টার-দিয়ে-মাল্টি-সার্ভার-চালু-করা)
   - [ধাপ ৭: Nginx রিভার্স প্রক্সি কনফিগারেশন](#ধাপ-৭-nginx-রিভার্স-প্রক্সি-কনফিগারেশন)
   - [ধাপ ৮: ফ্রি SSL (HTTPS) সার্টিফিকেট সক্রিয়করণ](#ধাপ-৮-ফ্রি-ssl-https-সার্টিফিকেট-সক্রিয়করণ)
   - [ধাপ ৯: UFW ফায়ারওয়াল সিকিউরিটি কনফিগ](#ধাপ-৯-ufw-ফায়ারওয়াল-সিকিউরিটি-কনফিগ)
4. [পার্ট ৩: ডাটা আর্কিটেকচার ও লাইভ সিঙ্ক্রোনাইজেশন](#পার্ট-৩-ডাটা-আর্কিটেকচার-ও-লাইভ-সিঙ্ক্রোনাইজেশন)
5. [পার্ট ৪: ভবিষ্যতে কোড আপডেট ও সিঙ্ক করার নিয়ম](#পার্ট-৪-ভবিষ্যতে-কোড-আপডেট-ও-সিঙ্ক-করার-নিয়ম)
6. [পার্ট ৫: ব্যাকআপ, রিস্টোর ও ট্রাবলশুটিং (FAQ)](#পার্ট-৫-ব্যাকআপ-রিস্টোর-ও-ট্রাবলশুটিং-faq)

---

## আর্কিটেকচার ও টেকনোলজি ওভারভিউ

- **ফ্রন্টএন্ড**: ফ্রেমওয়ার্ক-হীন পিওর ভ্যানিলা জাভাস্ক্রিপ্ট (Vanilla ES6+ JS), HTML5 এবং মডার্ন সিএসএস টোকেন (`assets/css/`)। সম্পূর্ণ ডে/নাইট মোড ও মোবাইল রেসপনসিভ।
- **ব্যাকএন্ড ইঞ্জিন**: Node.js & Express REST API (`dev3/API/app.js`) + লাইভ ইভেন্ট স্ট্রিমিং (Server-Sent Events - SSE at `/api/events`)।
- **মাল্টি-সার্ভার ক্লাস্টার ও লোড ব্যালেন্সার**: 
  - `load-balancer` (Port 7000): ট্রাফিক হ্যান্ডেল করে ওয়ার্কারদের মাঝে ডিস্ট্রিবিউট করে।
  - `api-worker-1` (Port 7001) এবং `api-worker-2` (Port 7002): প্যারালাল প্রসেসিং ও ফেইলওভার সাপোর্ট।
- **ডুয়াল ডাটাবেজ সিস্টেম**:
  - মেমোরি ও ফাইল ক্যাশ: `dev3/API/data/originate_db.json` (সুপার ফাস্ট ০ms লোড টাইম)।
  - ইউজার ডাটা পার্টিশন: `dev3/API/data/user data/<user.id>.json` (প্রতিটি ইউজারের প্রোফাইল, টাস্ক হিস্ট্রি, My Work ও পাঞ্চ লগ আলাদা ফাইলে সংরক্ষিত)।
  - পার্মানেন্ট ডিলিট ট্র্যাকার: `dev3/API/data/tombstones.json` (ডিলিট হওয়া আইটেম যেন রিফ্রেশে ফিরে না আসে)।
  - রিলেশনাল ডাটাবেজ: MySQL 8.0+ / MariaDB (`originate_command_db`)।
- **প্রসেস ম্যানেজার**: PM2 (অটো রিস্টার্ট, মেমোরি গার্ড ও সিস্টেম বুট অটো-স্টার্ট)।
- **রিভার্স প্রক্সি**: Nginx (Port 80/443 -> Port 7000) সাথে ফুল SSE বাফারিং কন্ট্রোল।

---

## পার্ট ১: লোকাল পিসি (Windows) ডেভেলপমেন্ট ও রান সেটআপ

আপনার লোকাল উইন্ডোজ কম্পিউটারে প্রজেক্টটি রান ও ডেভেলপমেন্ট করার জন্য নিচের সহজ ধাপগুলো অনুসরণ করুন:

### ১. পূর্বশর্ত (Prerequisites):
- [Node.js](https://nodejs.org/) (LTS Version 18 বা 20) ইনস্টল করা থাকতে হবে।
- [XAMPP](https://www.apachefriends.org/) (Apache ও MySQL চালানোর জন্য) অথবা সরাসরি MySQL Server।
- গ্লোবালি PM2 ইনস্টল করতে টার্মিনালে রান করুন:
  ```powershell
  npm install -g pm2
  ```

### ২. ডিপেনডেন্সি ইনস্টলেশন:
উইন্ডোজ PowerShell বা টার্মিনাল ওপেন করে প্রজেক্টের ফোল্ডারে যান:
```powershell
cd c:\Users\fuadk\Documents\GitHub\Originate-Command

# API এর প্যাকেজ ইনস্টল করুন
cd dev3\API
npm install

# লোড ব্যালেন্সারের প্যাকেজ ইনস্টল করুন (যদি থাকে)
cd ..\load-balancer
npm install 2>$null

cd ..\..
```

### ৩. ডাটাবেজ সেটআপ (১-ক্লিক অটোমেটিক ইমপোর্ট):
1. **XAMPP Control Panel** ওপেন করে **MySQL** স্টার্ট করুন।
2. আপনার `database_schema.sql` ফাইলের ভেতরেই ডাটাবেজ তৈরি (`CREATE DATABASE IF NOT EXISTS originate_command_db;`) এবং সব টেবিল তৈরির কুয়েরি সাজানো আছে।
3. **কমান্ড লাইন থেকে ১ ক্লিকে ইমপোর্ট করতে:**
   ```powershell
   cd c:\Users\fuadk\Documents\GitHub\Originate-Command\dev3\API
   mysql -u root < database_schema.sql
   ```
   *(বিকল্প: আপনি চাইলে ব্রাউজারে `http://localhost/phpmyadmin` এ গিয়ে সরাসরি **Import** ট্যাবে গিয়ে `database_schema.sql` ফাইলটি সিলেক্ট করে **Go** চাপলেও ডাটাবেজ ও সব টেবিল অটোমেটিক তৈরি হয়ে যাবে)*

### ৪. লোকাল পরিবেশ কনফিগারেশন (`.env`):
`dev3/API/.env` ফাইলটি ওপেন করে নিশ্চিত করুন:
```env
PORT=7000
NODE_ENV=development

DB_ENABLE_MYSQL=true
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=originate_command_db

# ইনভাইটেশন ইমেইল পাঠানোর জন্য Gmail SMTP
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_app_password
FROM_EMAIL=Originate Command <your_email@gmail.com>
```

### ৫. এক ক্লিকে সম্পূর্ণ সিস্টেম চালু করা:
প্রজেক্টের রুট ফোল্ডারে থাকা `start-servers.bat` ফাইলে ডাবল ক্লিক করুন (অথবা টার্মিনালে রান করুন):
```powershell
.\start-servers.bat
```
এই স্ক্রিপ্টটি স্বয়ংক্রিয়ভাবে:
- PM2 ক্লাস্টার চালু করবে (Port 7000 Load Balancer + Ports 7001, 7002 Workers)।
- Cloudflare Tunnel গেটওয়ে চালু করবে।
- ব্রাউজারে ব্যবহারের জন্য সম্পূর্ণ প্রস্তুত করবে।

সাইটটি ওপেন করতে ব্রাউজারে প্রবেশ করুন:
- **লোকাল ওয়েব ইন্টারফেস**: `http://localhost:7000` অথবা সরাসরি ফাইল ওপেন করুন `index.html`।
- **সার্ভার বন্ধ করতে**: `.\stop-servers.bat` ফাইলে ডাবল ক্লিক করুন।

### ৬. লোকাল টেস্ট সুইট যাচাই:
পুরো প্রজেক্টের সব ফাংশনালিটি, পারমিশন ও ডাটাবেজ সিঙ্ক ঠিক আছে কিনা চেক করতে চালান:
```powershell
node tests/run_all.js
```
*(রেজাল্ট: ৪৭টি টেস্টের মধ্যে ৪৭টিই ১০০% পাস দেখাবে)*

---

## পার্ট ২: লিনাক্স VPS-এ সম্পূর্ণ প্রোডাকশন ডিপ্লয়মেন্ট (Step-by-Step)

নতুন একটি Linux VPS-এ (Ubuntu 22.04 / 24.04 LTS) সম্পূর্ণ প্রজেক্ট লাইভ করার জন্য নিচে প্রতিটি কমান্ড ক্রমান্বয়ে দেওয়া হলো:

```
[ব্রাউজার / ক্লায়েন্ট]
         │ (Port 80 / 443 HTTPS)
         ▼
    [Nginx Proxy]
         │ (Port 7000 Proxy Pass)
         ▼
[dev3 Load Balancer]
   ├───► [api-worker-1] (Port 7001) ───┐
   └───► [api-worker-2] (Port 7002) ───┤
                                       ▼
                   [Dual Storage: In-Memory JSON + MySQL DB]
                   - dev3/API/data/originate_db.json
                   - dev3/API/data/user data/*.json
                   - MySQL: originate_command_db
```

---

### ধাপ ১: VPS-এ প্রাথমিক প্যাকেজ ইনস্টলেশন

আপনার কম্পিউটার থেকে SSH দিয়ে VPS-এ প্রবেশ করুন:
```bash
ssh root@YOUR_VPS_IP
```
*(YOUR_VPS_IP এর জায়গায় আপনার VPS-এর আইপি দিন)*

VPS-এ নিচের কমান্ডগুলো রান করুন:
```bash
# ১. সিস্টেম রিপোজিটরি আপডেট করুন
sudo apt update && sudo apt upgrade -y

# ২. Node.js 20.x (LTS) এবং অন্যান্য টুলস ইনস্টল করুন
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx ufw tar curl

# ৩. গ্লোবালি PM2 ইনস্টল করুন
sudo npm install -g pm2

# ৪. সফল ইনস্টলেশন নিশ্চিত করুন
node -v
npm -v
pm2 -v
```

---

### ধাপ ২: GitHub থেকে ফ্রন্টএন্ড রিপোজিটরি ক্লোন

VPS-এর `/var/www/` ফোল্ডারে রিপোজিটরিটি নামিয়ে নিন:
```bash
cd /var/www
git clone https://github.com/Fuad2e3/Originate-Command.git originate-command
cd originate-command
```
*(নোট: যেহেতু রিপোজিটরির `.gitignore`-এ `dev3/` রাখা ছিল, তাই এখানে শুধুমাত্র সুরক্ষিত ফ্রন্টএন্ড ফাইলগুলো ক্লোন হবে)*

---

### ধাপ ৩: লোকাল পিসি থেকে প্রাইভেট `dev3` ফোল্ডার VPS-এ আপলোড

> [!IMPORTANT]
> লোকাল পিসির `node_modules` ফাইলগুলো VPS-এ পাঠাবেন না। উইন্ডোজের বাইনারি লিনাক্সে চলবে না এবং হাজার হাজার ফাইল আপলোডে সময় নষ্ট হবে।

আপনার **লোকাল পিসির Windows PowerShell** ওপেন করে প্রজেক্টের রুটে যান:
```powershell
cd c:\Users\fuadk\Documents\GitHub\Originate-Command
```

এখন `node_modules` বাদ দিয়ে শুধুমাত্র আসল সোর্স কোড ও ডাটা ফাইলসহ `dev3` ফোল্ডারটি জিপ করে VPS-এ পাঠিয়ে দিন:
```powershell
# ১. node_modules ছাড়া dev3 কম্প্রেস করুন
tar --exclude="node_modules" -czvf dev3.tar.gz dev3

# ২. SCP দিয়ে ফাইলটি VPS-এ পাঠিয়ে দিন (YOUR_VPS_IP পরিবর্তন করুন)
scp dev3.tar.gz root@YOUR_VPS_IP:/var/www/originate-command/
```
*(বিকল্প: আপনি চাইলে **FileZilla** বা **WinSCP** সফটওয়্যার দিয়েও পিসির `dev3` ফোল্ডারটি ড্র্যাগ করে VPS-এর `/var/www/originate-command/` ডিরেক্টরিতে আপলোড করতে পারেন)*

---

### ধাপ ৪: VPS-এ `dev3` আনপ্যাক, ডিপেনডেন্সি ও ফাইল পারমিশন

এখন আবার **VPS টার্মিনালে** নিচের কমান্ডগুলো দিন:

```bash
cd /var/www/originate-command

# ১. dev3 আনপ্যাক করুন এবং জিপ ফাইল মুছে ফেলুন
tar -xzvf dev3.tar.gz
rm dev3.tar.gz

# ২. লিনাক্স পরিবেশের জন্য ফ্রেশ node_modules ইনস্টল করুন
cd dev3/API
npm install

# ৩. লোড ব্যালেন্সারে অতিরিক্ত প্যাকেজ লাগলে ইনস্টল করুন
cd ../load-balancer
npm install 2>/dev/null || true

# ৪. ডাটা ডিরেক্টরির পারমিশন ও ফাইল ইন্টিগ্রিটি নিশ্চিত করুন
cd /var/www/originate-command
mkdir -p "dev3/API/data/user data"
chmod -R 775 dev3/API/data
chmod -R 775 "dev3/API/data/user data"
chown -R $USER:$USER dev3/API/data
```

---

### ধাপ ৫: MySQL ইনস্টল ও ১-ক্লিক অটো ডাটাবেজ তৈরি (`database_schema.sql`)

আপনার `database_schema.sql` ফাইলে ডাটাবেজ তৈরি ও টেবিল তৈরির সব কোড রেডি করা আছে। ম্যানুয়ালি টেবিল বানানোর কোনো প্রয়োজন নেই!

#### ১. MySQL সার্ভার ইনস্টল ও সার্ভিস সক্রিয় করুন:
```bash
sudo apt install -y mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql
```

#### ২. সরাসরি `database_schema.sql` দিয়ে ১ ক্লিকে ডাটাবেজ ও সব টেবিল তৈরি করুন:
```bash
cd /var/www/originate-command/dev3/API
sudo mysql < database_schema.sql
```
*(এই একটি কমান্ডেই `originate_command_db` ডাটাবেজ এবং এর ভেতরে সমস্ত টেবিল তৈরি হয়ে যাবে)*

#### ৩. Node.js অ্যাপের জন্য ১-লাইনের পারমিশন ও ইউজার তৈরি করুন:
```bash
sudo mysql -e "CREATE USER IF NOT EXISTS 'originate_user'@'localhost' IDENTIFIED BY 'StrongDBPass123!'; GRANT ALL PRIVILEGES ON originate_command_db.* TO 'originate_user'@'localhost'; FLUSH PRIVILEGES;"
```
*(পাসওয়ার্ড `StrongDBPass123!` আপনার পছন্দমতো নিরাপদ পাসওয়ার্ডে পরিবর্তন করতে পারেন)*

#### ৪. টেবিলগুলো তৈরি হয়েছে কিনা এক লাইনে যাচাই করুন:
```bash
sudo mysql -u originate_user -pStrongDBPass123! -e "USE originate_command_db; SHOW TABLES;"
```
*(স্ক্রিনে `departments`, `users`, `clients`, `todos`, `instructions`, `messages`, `channels`, `activities` ইত্যাদি সব টেবিল দেখতে পাবেন)*

#### ৫. `dev3/API/.env` ফাইলটি কনফিগার করুন:
```bash
nano /var/www/originate-command/dev3/API/.env
```
ফাইলে নিচের মতো ভ্যালুগুলো সেট করুন:
```env
PORT=7000
NODE_ENV=production

# MySQL Database
DB_ENABLE_MYSQL=true
DB_HOST=localhost
DB_USER=originate_user
DB_PASSWORD=StrongDBPass123!
DB_NAME=originate_command_db

# Outbound Email Dispatcher (Gmail SMTP)
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_app_password
FROM_EMAIL=Originate Command <your_email@gmail.com>

# Server Domain / URL
APP_URL=https://originateteam.com
```
*(ফাইলটি সেভ করতে `Ctrl + O` চেপে `Enter` দিন, বের হতে `Ctrl + X` চাপুন)*

---

### ধাপ ৬: PM2 ক্লাস্টার দিয়ে মাল্টি-সার্ভার চালু করা

আপনার সিস্টেমে রয়েছে **লোড ব্যালেন্সার (Port 7000)** এবং **২টি ব্যাকএন্ড ওয়ার্কার (Port 7001 ও 7002)**। 
যেহেতু VPS-এ সরাসরি পাবলিক আইপি ও Nginx রিভার্স প্রক্সি রয়েছে, তাই লোকাল টানেলের (`tunnel-gateway`) কোনো প্রয়োজন নেই।

নিচের কমান্ড দিয়ে লোড ব্যালেন্সার ও ওয়ার্কারদ্বয় চালু করুন:
```bash
cd /var/www/originate-command/dev3

# লোড ব্যালেন্সার এবং ২টি ওয়ার্কার ব্যাকএন্ড চালু করুন
pm2 start ecosystem.config.js --only "load-balancer,api-worker-1,api-worker-2"

# ক্লাস্টারের লাইভ স্ট্যাটাস যাচাই করুন (৩টি প্রসেসই online দেখাবে)
pm2 status

# সার্ভার রিবুট বা রিস্টার্ট হলেও যেন স্বয়ংক্রিয়ভাবে সার্ভিস চালু হয়
pm2 save
pm2 startup
```
*(স্ক্রিনে `sudo env PATH=...` দিয়ে একটি কমান্ড আসবে, সেটি হুবহু কপি করে টার্মিনালে পেস্ট করে Enter দিন)*

---

### ধাপ ৭: Nginx রিভার্স প্রক্সি কনফিগারেশন

ইউজাররা যাতে কোনো পোর্ট নম্বর (যেমন `:7000`) ছাড়াই সরাসরি আপনার ডোমেইন বা VPS আইপি দিয়ে ব্রাউজার থেকে সাইট লোড করতে পারে:

#### ১. Nginx কনফিগ ফাইল তৈরি করুন:
```bash
sudo nano /etc/nginx/sites-available/originate-command
```

#### ২. নিচের কনফিগারেশনটি পেস্ট করুন:
*(YOUR_DOMAIN_OR_IP এর জায়গায় আপনার ডোমেইন নাম অথবা VPS-এর আইপি এড্রেস দিন)*
```nginx
server {
    listen 80;
    server_name originateteam.com www.originateteam.com;

    # ফাইল ও অ্যাটাচমেন্ট আপলোড সাইজ সীমা
    client_max_body_size 25M;

    # স্ট্যাটিক ফ্রন্টএন্ড ও ডাইনামিক API রিভার্স প্রক্সি
    location / {
        proxy_pass http://127.0.0.1:7000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Server-Sent Events (SSE) লাইভ ইভেন্ট স্ট্রিমিং বাফারিং মুক্ত রাখা বাধ্যতামূলক
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```
*(সেভ করতে `Ctrl + O` চেপে `Enter`, বের হতে `Ctrl + X` চাপুন)*

#### ৩. সাইট সক্রিয় করুন ও Nginx রিলোড দিন:
```bash
sudo ln -s /etc/nginx/sites-available/originate-command /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

### ধাপ ৮: ফ্রি SSL (HTTPS) সার্টিফিকেট সক্রিয়করণ

আপনার নিজস্ব ডোমেইন নাম `originateteam.com`-এ Let's Encrypt দিয়ে সম্পূর্ণ ফ্রি লাইফটাইম অটো-রিনিউয়েবল SSL সক্রিয় করুন:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d originateteam.com -d www.originateteam.com
```
*(ইমেইল অ্যাড্রেস চাইলে আপনার ইমেইল দিন এবং টার্মস এগ্রি করতে `Y` দিন। Certbot স্বয়ংক্রিয়ভাবে Nginx ফাইলে HTTPS রিডাইরেক্ট সেট করে দেবে)*

---

### ধাপ ৯: UFW ফায়ারওয়াল সিকিউরিটি কনফিগ

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## পার্ট ৩: ডাটা আর্কিটেকচার ও লাইভ সিঙ্ক্রোনাইজেশন

আপনার অ্যাপ্লিকেশনের হাই-স্পিড পারফরম্যান্স এবং ডেটা স্থায়িত্বের পেছনে ৩টি কোর মেকানিজম কাজ করে:

### ১. মেমোরি ও সেন্ট্রাল ফাইল ক্যাশ (`originate_db.json`):
- সার্ভার যখন বুট হয়, তখন `originate_db.json` সরাসরি মেমোরিতে (`inMemoryState`) লোড হয়।
- এর ফলে যেকোনো রিড বা রিকোয়েস্টে ডাটাবেজের জন্য অপেক্ষা না করে **০ মিলিসেকেন্ডে** তাৎক্ষণিক রেসপন্স পাওয়া যায়।

### ২. ইউজার ডাটা পার্টিশন (`dev3/API/data/user data/<user.id>.json`):
- মূল ডাটাবেজ ফাইল যেন হাজার হাজার লাইনে ভারী না হয়ে যায়, সেজন্য প্রতিটি ইউজারের নিজস্ব প্রোফাইল, কাজের ইতিহাস (My Work), পাঞ্চ-ইন/আউট লগ এবং ব্যক্তিগত টাস্ক আলাদা ফাইলে জমা থাকে।
- **ডাটা অক্ষুণ্ণ থাকা**: আপনি যখন লোকাল পিসি থেকে ধাপ ৩ অনুযায়ী `dev3.tar.gz` পাঠিয়ে আনপ্যাক করেছেন, তখন আপনার লোকাল পিসির সমস্ত ইউজার ডাটা, বিদ্যমান অ্যাকাউন্ট ও টাস্ক অপরিবর্তিত অবস্থায় VPS-এ চলে এসেছে। কোনো ডাটা লস হবে না।

### ৩. টম্বস্টোন ট্র্যাকার (`tombstones.json`):
- কোনো ক্লায়েন্ট, টাস্ক বা নোটিশ ডিলিট করা হলে তা সেন্ট্রাল মেমোরি এবং ডাটাবেজ উভয় স্থান থেকেই পার্মানেন্টলি ডিলিট হয় (Hard Delete)।
- সাথে সাথে তার আইডি `tombstones.json`-এ রেকর্ড করা হয়, যেন ব্যাকগ্রাউন্ড রিফ্রেশ বা পেজ রিলোডে ডিলিট হওয়া আইটেম আর কখনও ফিরে না আসে।

### ৪. ৩.৫ সেকেন্ড অটো-রিফ্রেশ ও সিঙ্গল-ক্লিক নো-বাউন্স আপডেট:
- ফ্রন্টএন্ডে `assets/js/store.js` প্রতি ৩.৫ সেকেন্ড পর পর ব্যাকগ্রাউন্ডে সার্ভারের সাথে স্টেট সিঙ্ক করে।
- তবে ইউজার যখন টাস্কে ক্লিক করেন বা স্ট্যাটাস চেঞ্জ করেন, অপটিমিস্টিক UI আপডেটের কারণে তাৎক্ষণিকভাবে ১ ক্লিকেই পরিবর্তন সম্পন্ন হয় (কোনো রিফ্রেশ ফ্লিকার বা ২-৩ বার বাউন্স হয় না)।

---

## পার্ট ৪: ভবিষ্যতে কোড আপডেট ও সিঙ্ক করার নিয়ম

ভবিষ্যতে যদি আপনি ফ্রন্টএন্ড বা ব্যাকএন্ড কোডে কোনো পরিবর্তন করেন, তবে তা VPS-এ সহজে আপডেট করার নিয়ম:

### ১. ফ্রন্টএন্ড কোড আপডেট (GitHub পুশ করা থাকলে):
```bash
cd /var/www/originate-command
git pull origin main
```

### ২. ব্যাকএন্ড (`dev3`) কোড আপডেট:
লোকাল পিসি থেকে আপডেট করা `dev3` ফাইলটি SCP বা FileZilla দিয়ে VPS-এ পাঠিয়ে দিন, তারপর VPS টার্মিনালে PM2 রিস্টার্ট দিন:
```bash
pm2 restart all
```

---

## পার্ট ৫: ব্যাকআপ, রিস্টোর ও ট্রাবলশুটিং (FAQ)

### প্রতিদিনের প্রয়োজনীয় কমান্ডসমূহ:
- **সব সার্ভারের লাইভ অবস্থা দেখতে:**
  ```bash
  pm2 status
  ```
- **লাইভ ট্রাফিক ও কনসোল এরর লগ দেখতে:**
  ```bash
  pm2 logs
  ```
- **সার্ভার রিস্টার্ট করতে:**
  ```bash
  pm2 restart all
  ```
- **ডাটাবেজের এক-ক্লিক ব্যাকআপ নিতে:**
  ```bash
  # JSON ডাটা ব্যাকআপ
  tar -czvf /root/db_backup_$(date +%F).tar.gz /var/www/originate-command/dev3/API/data/

  # MySQL ডাটা ব্যাকআপ
  sudo mysqldump -u originate_user -pStrongDBPass123! originate_command_db > /root/mysql_backup_$(date +%F).sql
  ```

### সচরাচর জিজ্ঞাসিত প্রশ্ন (Troubleshooting FAQ):

**প্রশ্ন ১: `sudo mysql < database_schema.sql` চালালে কি আগের ডাটা ডিলিট হয়ে যাবে?**  
> উত্তর: না। ফাইলের প্রতিটি কুয়েরিতে `CREATE TABLE IF NOT EXISTS` দেওয়া আছে। ফলে নতুন টেবিল বা স্ট্রাকচার যুক্ত হবে, কিন্তু বিদ্যমান কোনো ডাটা মুছে যাবে না।

**প্রশ্ন ২: ব্রাউজারে `502 Bad Gateway` দেখালে কী করব?**  
> উত্তর: এর মানে Nginx চালু আছে কিন্তু PM2 ব্যাকএন্ড বন্ধ আছে। VPS টার্মিনালে `pm2 status` চেক করুন এবং `pm2 restart all` দিন।

**প্রশ্ন ৩: সার্ভার রিবুট হলে PM2 কি নিজে নিজে চালু হবে?**  
> উত্তর: হ্যাঁ, যদি আপনি ধাপ ৬ অনুযায়ী `pm2 save` এবং `pm2 startup` কমান্ড দিয়ে থাকেন, তবে সার্ভার ক্র্যাশ বা রিস্টার্ট হলেও স্বয়ংক্রিয়ভাবে সব প্রসেস চালু হয়ে যাবে।
