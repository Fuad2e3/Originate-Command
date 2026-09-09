# Originate Command — VPS Transfer & Migration Master Guide
> **এক VPS থেকে অন্য VPS-এ সম্পূর্ণ প্রজেক্ট ও ডাটা ১ বিন্দুও না হারিয়ে (Zero Data Loss) স্থানান্তরের পূর্ণাঙ্গ গাইড**

এই গাইডের প্রতিটি ধাপ অনুসরণ করে আপনি খুব সহজেই বর্তমান VPS সার্ভার থেকে নতুন যেকোনো লিনাক্স VPS সার্ভারে (Ubuntu 22.04 / 24.04 LTS) সম্পূর্ণ ওয়েবসাইট, ইউজার ডাটা, এটেনডেন্স লগ এবং MySQL ডাটাবেজ সুরক্ষিতভাবে ট্রান্সফার করতে পারবেন।

---

## 📋 স্থানান্তরের ধাপসমূহ (Migration Workflow)

```
[বর্তমান VPS (Old VPS)]                             [নতুন VPS (New VPS)]
        │                                                    │
 1. MySQL Dump (db_backup.sql)                               │
 2. User Data + Code Archive (dev3_backup.tar.gz)            │
        │                                                    │
        └───────────────── SCP Transfer ────────────────────►│
                                                             │
                                                      3. Environment Setup
                                                      4. Code Unpack & Restore
                                                      5. MySQL DB Import
                                                      6. PM2 Cluster Start
                                                      7. Nginx & SSL Setup
                                                             │
                                                      8. Cloudflare DNS Update
```

---

## ধাপ ১: বর্তমান VPS থেকে সম্পূর্ণ ব্যাকআপ নেওয়া

বর্তমান VPS-এর টার্মিনালে প্রবেশ করে নিচের কমান্ডগুলো দিন:

```bash
# ১. MySQL-এর সমস্ত লাইভ ডাটা এক্সপোর্ট করুন
mysqldump -u originate_user -pStrongDBPass123! originate_command_db > /root/db_backup.sql

# ২. সমস্ত ইউজার ডাটা (user data/*.json) ও কোড জিপ করুন (node_modules বাদ দিয়ে)
cd /var/www/originate-command
tar --exclude="node_modules" --exclude="*.log" -czvf /root/dev3_backup.tar.gz dev3

# ৩. ব্যাকআপ ফাইলগুলো তৈরি হয়েছে কিনা নিশ্চিত করুন
ls -lh /root/db_backup.sql /root/dev3_backup.tar.gz
```

> **কী কী ব্যাকআপ হলো:**
> - MySQL-এর সব ১৯টি টেবিল ও সমস্ত রেকর্ড (`db_backup.sql`)।
> - `user data/` ফোল্ডারের প্রতিটি ইউজারের ব্যক্তিগত ফাইল ও হিস্ট্রি (`dev3_backup.tar.gz`)।
> - সেন্ট্রাল মেমোরি স্টেট `originate_db.json` ও টম্বস্টোন ট্র্যাকার।

---

## ধাপ ২: ব্যাকআপ ফাইলগুলো নতুন VPS-এ ট্রান্সফার করা

বর্তমান VPS টার্মিনাল থেকেই সরাসরি নতুন VPS-এ ফাইল দুটি পাঠিয়ে দিন:

```bash
# ১. ডাটাবেজ ব্যাকআপ ফাইলটি পাঠান
scp /root/db_backup.sql root@NEW_VPS_IP:/root/

# ২. প্রজেক্ট ও ইউজার ডাটা আর্কাইভটি পাঠান
scp /root/dev3_backup.tar.gz root@NEW_VPS_IP:/root/
```
*(⚠️ নোট: `NEW_VPS_IP` এর জায়গায় আপনার নতুন VPS-এর আসল পাবলিক আইপি অ্যাড্রেস দিন এবং পাসওয়ার্ড চাইলে নতুন VPS-এর রুট পাসওয়ার্ড লিখুন)*

---

## ধাপ ৩: নতুন VPS-এ প্রাথমিক সফটওয়্যার ইনস্টলেশন

এখন আপনার **নতুন VPS টার্মিনালে** প্রবেশ করুন এবং নিচের কমান্ডগুলো দিন:

```bash
# ১. সিস্টেম আপডেট ও প্রয়োজনীয় প্যাকেজ ইনস্টল
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs npm git nginx mysql-server certbot python3-certbot-nginx ufw mc curl

# ২. গ্লোবালি PM2 ইনস্টল করুন
sudo npm install -g pm2

# ৩. ইনস্টলেশন যাচাই
node -v
npm -v
pm2 -v
```

---

## ধাপ ৪: নতুন VPS-এ ফ্রন্টএন্ড ও ব্যাকএন্ড রিস্টোর

নতুন VPS টার্মিনালে রান করুন:

```bash
# ১. ফ্রন্টএন্ড রিপোজিটরি নামিয়ে নিন
cd /var/www
git clone https://github.com/Fuad2e3/Originate-Command.git originate-command
cd /var/www/originate-command

# ২. পুরাতন VPS থেকে পাঠানো dev3 ব্যাকআপটি আনপ্যাক করুন
tar -xzvf /root/dev3_backup.tar.gz
rm /root/dev3_backup.tar.gz

# ৩. ফ্রেশ লিনাক্স প্যাকেজ ইনস্টল করুন
cd dev3/API
npm install

cd ../load-balancer
npm install 2>/dev/null || true

# ৪. ডাটা ডিরেক্টরির পারমিশন নিশ্চিত করুন
cd /var/www/originate-command
chmod -R 775 dev3/API/data
chmod -R 775 "dev3/API/data/user data"
chown -R root:root dev3/API/data
```

---

## ধাপ ৫: MySQL ডাটাবেজ রিস্টোর (১-ক্লিক ইমপোর্ট)

নতুন VPS টার্মিনালে নিচের কমান্ডগুলো দিয়ে ডাটাবেজ রিস্টোর করুন:

```bash
# ১. MySQL সার্ভিস স্টার্ট ও এনাবল করুন
systemctl start mysql
systemctl enable mysql

# ২. ডাটাবেজ তৈরি করুন এবং পুরাতন ব্যাকআপ ইমপোর্ট করুন
mysql -e "CREATE DATABASE IF NOT EXISTS originate_command_db;"
mysql originate_command_db < /root/db_backup.sql
rm /root/db_backup.sql

# ৩. ডাটাবেজ ইউজার তৈরি ও পূর্ণ পারমিশন প্রদান
mysql -e "CREATE USER IF NOT EXISTS 'originate_user'@'localhost' IDENTIFIED BY 'StrongDBPass123!'; GRANT ALL PRIVILEGES ON originate_command_db.* TO 'originate_user'@'localhost'; FLUSH PRIVILEGES;"

# ৪. ডাটাবেজ টেবিল ও রেকর্ড সফলভাবে এসেছে কিনা যাচাই করুন
mysql -u originate_user -pStrongDBPass123! originate_command_db -e "SHOW TABLES; SELECT count(*) FROM users;"
```
*(স্ক্রিনে ১৯টি টেবিল এবং ইউজারের সংখ্যা দেখতে পাবেন)*

---

## ধাপ ৬: PM2 ক্লাস্টার ও অটো-স্টার্ট চালু করা

নতুন VPS টার্মিনালে রান করুন:

```bash
cd /var/www/originate-command/dev3

# ১. লোড ব্যালেন্সার ও ২টি এপিআই ওয়ার্কার চালু করুন
pm2 start ecosystem.config.js

# ২. প্রসেস স্টেট সেভ করুন
pm2 save

# ৩. সার্ভার রিস্টার্ট হলে যাতে অটোমেটিক চালু হয়
pm2 startup systemd -u root --hp /root

# ৪. রানিং স্ট্যাটাস দেখুন
pm2 status
```

---

## ধাপ ৭: Nginx রিভার্স প্রক্সি ও ফ্রি SSL (HTTPS) চালু

নতুন VPS-এ Nginx কনফিগারেশন তৈরি করুন:

```bash
cat << 'EOF' > /etc/nginx/sites-available/originate-command
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name api.originateteam.com originateteam.com www.originateteam.com _;

    client_max_body_size 25M;

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

        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
EOF

# সাইট সক্রিয় করুন ও Nginx রিলোড দিন
ln -sf /etc/nginx/sites-available/originate-command /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

---

## ধাপ ৮: ডোমেইন DNS আপডেট (Cloudflare)

1. আপনার **Cloudflare Dashboard** ([dash.cloudflare.com](https://dash.cloudflare.com/))-এ লগইন করুন।
2. `originateteam.com`-এর **DNS** সেকশনে যান।
3. **`api`** A Record-এর আইপিটি এডিট করে আপনার **নতুন VPS-এর আইপি (NEW_VPS_IP)** বসিয়ে Save দিন।

---

## ধাপ ৯: নতুন VPS-এ SSL সক্রিয়করণ

DNS আপডেট হওয়ার পর নতুন VPS টার্মিনালে এই ১টি কমান্ড দিন:

```bash
certbot --nginx -d api.originateteam.com --non-interactive --agree-tos -m fuadkalaroa2002@gmail.com
```

---

## ✅ চূড়ান্ত ভেরিফিকেশন চেকলিস্ট (Verification Checklist)

সবকিছু সফল হয়েছে কিনা তা যাচাই করার শর্টকাট টেস্ট:

| টেস্টের বিষয় | কমান্ড / যাচাইয়ের উপায় | প্রত্যাশিত ফলাফল |
| :--- | :--- | :--- |
| **API Health** | `curl -s https://api.originateteam.com/api/health` | `{"status":"ok",...}` |
| **Users Data** | `curl -s https://api.originateteam.com/api/users` | ইউজারের তালিকা রেসপন্স করবে |
| **User Data Files** | `ls -la "/var/www/originate-command/dev3/API/data/user data"` | `u-fuad.json`, `u-shohag.json` থাকবে |
| **MySQL Tables** | `mysql -u originate_user -pStrongDBPass123! originate_command_db -e "SHOW TABLES;"` | ১৯টি টেবিল প্রদর্শিত হবে |
| **PM2 Status** | `pm2 status` | ৩টি প্রসেস `online` থাকবে |
| **লাইভ ওয়েবসাইট** | ব্রাউজারে `https://originateteam.com` ওপেন করুন | স্ট্যাটাসবারে সবুজ `Live DB Sync` দেখাবে |

> 💡 **মনে রাখুন:** ভবিষ্যতে ট্রান্সফার করতে হলে আপনাকে কোনো কিছু নিজে করতে হবে না, শুধু আমাকে নতুন VPS-এর আইপি ও পাসওয়ার্ড দিলে আমি নিজেই এই পুরো প্রসেসটি অটোমেটিক করে দিতে পারব!
