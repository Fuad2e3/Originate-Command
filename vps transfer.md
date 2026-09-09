# এক VPS থেকে অন্য VPS-এ স্থানান্তর গাইড (Zero Data Loss)

> **পুরনো VPS থেকে নতুন VPS-এ ১ বিন্দুও ডাটা না হারিয়ে সম্পূর্ণ প্রজেক্ট স্থানান্তর করার সরাসরি কমান্ড ও নিয়মাবলী।**

---

### ধাপ ১: পুরনো (বর্তমান) VPS-এ যা চালাবেন (ফুল ব্যাকআপ)

বর্তমান VPS টার্মিনালে এই ২টি কমান্ড দিয়ে সমস্ত ডাটা ব্যাকআপ করুন:

```bash
# ১. MySQL ডাটাবেজের সমস্ত ডাটা এক্সপোর্ট
mysqldump -u originate_user -pStrongDBPass123! originate_command_db > /root/db_backup.sql

# ২. সমস্ত ইউজার ডাটা (user data/ ফোল্ডার) ও সোর্স কোড জিপ করা
cd /var/www/originate-command
tar --exclude="node_modules" --exclude="*.log" -czvf /root/dev3_backup.tar.gz dev3
```

---

### ধাপ ২: পুরনো VPS থেকে নতুন VPS-এ ফাইল পাঠানো

পুরনো VPS টার্মিনাল থেকেই সরাসরি নতুন VPS-এ ফাইল দুটি পাঠিয়ে দিন:

```bash
scp /root/db_backup.sql root@NEW_VPS_IP:/root/
scp /root/dev3_backup.tar.gz root@NEW_VPS_IP:/root/
```
*(নোট: `NEW_VPS_IP` এর জায়গায় নতুন সার্ভারের আইপি দিন এবং নতুন সার্ভারের পাসওয়ার্ড লিখুন)*

---

### ধাপ ৩: নতুন VPS-এ যা যা চালাবেন (সেটআপ, রিস্টোর ও রান)

নতুন VPS টার্মিনালে ঢুকে ক্রমান্বয়ে নিচের কমান্ডগুলো দিন:

#### ১. প্যাকেজ ইনস্টল:
```bash
apt update && apt install -y nodejs npm git nginx mysql-server certbot python3-certbot-nginx tar curl
npm install -g pm2
systemctl start mysql && systemctl enable mysql
```

#### ২. রিপোজিটরি ক্লোন ও ব্যাকআপ ফাইল আনপ্যাক:
```bash
cd /var/www
git clone https://github.com/Fuad2e3/Originate-Command.git originate-command
cd /var/www/originate-command

# পুরনো সার্ভার থেকে আনা ব্যাকআপ ফাইল আনপ্যাক
tar -xzvf /root/dev3_backup.tar.gz

# প্যাকেজ ইনস্টল
cd dev3/API && npm install
cd ../load-balancer && npm install 2>/dev/null || true

# পারমিশন নিশ্চিত করা
cd /var/www/originate-command
chmod -R 775 dev3/API/data
chmod -R 775 "dev3/API/data/user data"
chown -R root:root dev3/API/data
```

#### ৩. ডাটাবেজ তৈরি ও ১-ক্লিকে ডাটা রিস্টোর:
```bash
# ডাটাবেজ তৈরি
mysql -e "CREATE DATABASE IF NOT EXISTS originate_command_db;"

# ব্যাকআপ ইমপোর্ট (সব ইউজার, টাস্ক, হিস্ট্রি হুবহু রিস্টোর হবে)
mysql originate_command_db < /root/db_backup.sql

# ডাটাবেজ ইউজার তৈরি ও পারমিশন
mysql -e "CREATE USER IF NOT EXISTS 'originate_user'@'localhost' IDENTIFIED BY 'StrongDBPass123!'; GRANT ALL PRIVILEGES ON originate_command_db.* TO 'originate_user'@'localhost'; FLUSH PRIVILEGES;"
```

#### ৪. PM2 ক্লাস্টার চালু ও অটো-বুট সেট করা:
```bash
cd /var/www/originate-command/dev3
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root
```

#### ৫. Nginx রিভার্স প্রক্সি কনফিগারেশন:
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

ln -sf /etc/nginx/sites-available/originate-command /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

---

### ধাপ ৪: Cloudflare DNS আপডেট

1. **Cloudflare**-এ আপনার `originateteam.com` এর **DNS** সেকশনে যান।
2. **`api`** (A Record)-এর IP পরিবর্তন করে আপনার **নতুন VPS-এর IP (`NEW_VPS_IP`)** বসিয়ে দিন।

---

### ধাপ ৫: নতুন VPS-এ SSL (HTTPS) চালু

DNS পরিবর্তন করার পর নতুন VPS টার্মিনালে চালান:
```bash
certbot --nginx -d api.originateteam.com --non-interactive --agree-tos -m fuadkalaroa2002@gmail.com
```

---

### ফলাফল:
- সমস্ত ইউজার একাউন্ট, কাজের হিস্ট্রি (My Work), এটেনডেন্স লগ ও ক্লায়েন্ট ডাটা হুবহু অক্ষুণ্ণ থাকবে।
- কোনো ডাটা লস হবে না।
