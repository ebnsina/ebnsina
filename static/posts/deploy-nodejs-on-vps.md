---
title: How to Deploy a Node.js Server on a VPS
date: '2024-03-15'
tags: ['node', 'devops']
excerpt: How to Deploy a Node.js Server on a VPS
---

Deploying a Node.js server on a Virtual Private Server (VPS) is a straightforward process that provides flexibility and control over your application. In this blog post, we'll go through the essential steps to get your Node.js application running on a VPS.

Step 1: Choose a VPS Provider
First, select a VPS provider that meets your needs. Popular options include:

- DigitalOcean
- Linode
- AWS Lightsail
- Vultr

Sign up for an account and create a new VPS instance. Choose an appropriate operating system, such as Ubuntu.

Step 2: Connect to Your VPS
Use SSH to connect to your VPS. Open your terminal and run:

```bash
ssh root@your_vps_ip_address
```

Replace your_vps_ip_address with the actual IP address of your VPS.

Step 3: Install Node.js
Once connected, update your package manager:

```bash
sudo apt update && sudo apt upgrade
```

Then, install Node.js. You can use Node Version Manager (NVM) for easy management:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
source ~/.bashrc
nvm install node
```

Step 4: Upload Your Application
You can use SCP or Git to upload your application files to the VPS. For example, using SCP:

```bash
scp -r /path/to/your/app root@your_vps_ip_address:/path/to/destination
```

Step 5: Install Dependencies
Navigate to your application directory and install the necessary dependencies:

```bash
cd /path/to/destination
npm install
```

Step 6: Set Up a Process Manager
Use a process manager like PM2 to keep your application running in the background:

```bash
npm install -g pm2
pm2 start app.js --name "my-app"
pm2 startup
pm2 save
```

Step 7: Configure a Reverse Proxy
Set up a reverse proxy with Nginx to route traffic to your Node.js application. Install Nginx:

```bash
sudo apt install nginx
# Then, configure it by creating a new file in /etc/nginx/sites-available/my-app:


nginx
server {
listen 80;
server_name your_domain_or_ip;

    location / {
        proxy_pass http://localhost:3000; # Change the port as needed
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

}
Link it to sites-enabled:
```

```bash
sudo ln -s /etc/nginx/sites-available/my-app /etc/nginx/sites-enabled/
```

Finally, restart Nginx:

```bash
sudo systemctl restart nginx
```

Step 8: Access Your Application
You should now be able to access your Node.js application by visiting your VPS's IP address or domain name in a web browser.

Conclusion
Deploying a Node.js server on a VPS gives you full control over your hosting environment. With these steps, you can have your application running smoothly and efficiently.

Happy coding!
