# Factory CMMS Enterprise — On-Prem LAN Deployment

Self-hosted industrial maintenance platform. Single Ubuntu machine, single URL,
no Docker, no cloud, no internet required after install.

```
┌──────────────────────────────────────────────────────────────┐
│                     Ubuntu 22.04 host                        │
│                                                              │
│   ┌────────────┐   proxy  ┌────────────┐   local  ┌────────┐ │
│   │  Nginx :80 │ ───────► │ FastAPI    │ ───────► │ Mongo  │ │
│   │  (public)  │  /api/*  │ 127.0.0.1  │          │ :27017 │ │
│   └────────────┘          │   :8001    │          └────────┘ │
│        ▲                  └────────────┘                     │
│        │ static React build (/var/www/factory-cmms)          │
└────────┼─────────────────────────────────────────────────────┘
         │
   ┌─────┴──────────────────────────┐
   │  Any LAN device                │
   │  http://<HOST_IP>              │
   │  (operator / technician /      │
   │   maintenance manager PCs)     │
   └────────────────────────────────┘
```

* **Frontend**: React production build served by Nginx.
* **Backend**: FastAPI on `127.0.0.1:8001` — reachable **only** through Nginx.
* **Database**: local MongoDB (`127.0.0.1:27017`).
* **Realtime**: WebSocket at `ws://<HOST_IP>/api/ws` — proxied by Nginx.

---

## 1. Install (fresh Ubuntu 22.04)

```bash
# From the repo root, as root/sudo:
chmod +x deploy/setup.sh
sudo ./deploy/setup.sh
```

`setup.sh` will:
1. Install `mongodb-org`, `nodejs 20`, `yarn`, `python3-venv`, `nginx`.
2. Copy the source to `/opt/factory-cmms`.
3. Create a Python virtualenv and install backend deps.
4. Build the React frontend for production and publish to `/var/www/factory-cmms`.
5. Configure Nginx as a reverse proxy on port 80.
6. Register the backend as a systemd service (`factory-cmms-backend.service`).
7. Generate a fresh JWT secret in `/opt/factory-cmms/backend/.env`.

## 2. Start

```bash
chmod +x deploy/start.sh
sudo ./deploy/start.sh
```

You'll see:

```
✓ All services running.
   MongoDB          up
   Backend (:8001)  up  (internal only)
   Nginx  (:80)     up

   ➜  Open in any browser on this LAN:
      http://192.168.1.100
```

## 3. Verify

```bash
chmod +x deploy/verify_install.sh
sudo ./deploy/verify_install.sh
```

Checks filesystem, services, ports, and HTTP endpoints — both loopback and LAN.

## 4. Stop

```bash
sudo ./deploy/stop.sh
```

Stops the backend service. Nginx and MongoDB stay running (they're general
system services). To stop them too, uncomment the corresponding lines in `stop.sh`.

---

## Default credentials (change after first login)

| Role       | Email                       | Password  |
|------------|-----------------------------|-----------|
| Admin      | `admin@factory.local`       | `Admin@123` |
| Technician | `tech@factory.local`        | `Tech@123`  |
| Operator   | `op@factory.local`          | `Op@123`    |

Admins can change passwords / add users under **Admin → Users** or reset by
editing `/opt/factory-cmms/backend/.env` and restarting the backend.

---

## Auto-detected LAN IP

Both `setup.sh` and `start.sh` print the machine's LAN IP using
`hostname -I`. Give this address to every operator / technician / manager PC on
the same network — they open a browser and go to `http://<HOST_IP>`.

To fix a static IP for this server (recommended in a plant), configure Netplan:

```yaml
# /etc/netplan/01-static.yaml
network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: no
      addresses: [192.168.1.100/24]
      routes: [{to: default, via: 192.168.1.1}]
      nameservers: {addresses: [192.168.1.1]}
```

Then `sudo netplan apply`.

---

## File layout after install

```
/opt/factory-cmms/                   # source + venv
├── backend/
│   ├── .env                         # secrets — 640, root-owned
│   ├── server.py, routers/, ...
│   └── requirements.txt
├── frontend/
│   ├── build/                       # copied to /var/www
│   └── src/
└── venv/                            # Python virtualenv

/var/www/factory-cmms/               # served by Nginx at /
/etc/nginx/sites-available/factory-cmms
/etc/systemd/system/factory-cmms-backend.service
```

## Useful commands

```bash
# Live backend logs
sudo journalctl -u factory-cmms-backend -f

# Nginx access log
sudo tail -f /var/log/nginx/access.log

# Restart backend (picks up .env changes)
sudo systemctl restart factory-cmms-backend

# Rebuild frontend after code change
cd /opt/factory-cmms/frontend
sudo -E yarn build
sudo cp -r build/* /var/www/factory-cmms/
```

## Backup

MongoDB data lives in `/var/lib/mongodb`. Backup nightly with:

```bash
sudo mongodump --out /backup/mongo-$(date +%F)
```

## Security notes

* Backend binds to `127.0.0.1` only — never exposed to LAN directly.
* Change the seed passwords immediately after first login.
* Rotate `JWT_SECRET` in `.env` and restart backend to invalidate all sessions.
* MongoDB has no auth by default (bound to loopback). If required, enable auth
  with `security.authorization: enabled` in `/etc/mongod.conf` and update
  `MONGO_URL` accordingly.
* `ufw` is auto-opened for TCP/80 only.

## Uninstall

```bash
sudo systemctl disable --now factory-cmms-backend
sudo rm /etc/systemd/system/factory-cmms-backend.service
sudo rm /etc/nginx/sites-enabled/factory-cmms /etc/nginx/sites-available/factory-cmms
sudo systemctl reload nginx
sudo rm -rf /opt/factory-cmms /var/www/factory-cmms
# (MongoDB data preserved unless you also `apt purge mongodb-org`)
```
