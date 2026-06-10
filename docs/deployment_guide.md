# Guida allo Sviluppo, Build e Deployment

Questa guida spiega come gestire lo sviluppo, compilare ed eseguire il deployment dell'applicazione **Beyblade X Tournament Manager** in base alla nuova architettura disaccoppiata (Frontend Client + Server Backend indipendente).

---

## 1. Architettura del Progetto

Il progetto è suddiviso in due componenti principali:

* **Backend Server (Axum + SQLite):** Gestisce il database dei blader, lo storico degli incontri, i tornei e fornisce le API REST + WebSocket per sincronizzare i dispositivi mobili dei referee.
* **Frontend App (React + Vite + Tauri):** È il client grafico (interfaccia utente). Può essere eseguito come app Desktop (Windows/macOS) o come app Mobile nativa (Android/iOS) e si collega al Backend tramite protocollo HTTP/WebSocket.

---

## 2. Modalità di Sviluppo (Dev Mode)

Per testare le modifiche localmente senza compilare i pacchetti di produzione, avvia il backend e il frontend separatamente.

### Passo 1: Avviare il Server Backend

Apri un terminale nella cartella radice del progetto ed esegui il server in modalità headless (porta di default: `7878`):

```bash
cargo run --manifest-path src-tauri/Cargo.toml --bin beyblade-x-app -- --server
```

### Passo 2: Avviare il Frontend Client (a seconda della piattaforma)

#### A. Sviluppo Web (Browser)

Se vuoi testare l'app direttamente in un browser web (es. Chrome, Safari):

```bash
npm run dev
```

L'interfaccia sarà accessibile all'indirizzo `http://localhost:5173` o simile (indicato nel terminale).

#### B. Sviluppo Desktop (Tauri)

Se vuoi testare l'interfaccia client all'interno della finestra desktop nativa di Tauri:

```bash
npm run tauri dev
```

#### C. Sviluppo Mobile (Simulatore/Emulatore)

* **Android**

  ```bash
  npm run tauri android dev
  ```

* **iOS (richiede macOS e Xcode)**

  ```bash
  npm run tauri ios dev
  ```

---

## 3. Deployment del Server Backend

Il server può essere deployato sia in locale (sullo stesso computer in cui gira l'app desktop) sia su un server remoto (VPS, Raspberry Pi o un PC dedicato nella rete locale WiFi).

### Passo 1: Compilazione in modalità Release

Genera il file binario ottimizzato per il backend:

```bash
cargo build --manifest-path src-tauri/Cargo.toml --release --bin beyblade-x-app
```

Il binario compilato si troverà in:

* `src-tauri/target/release/beyblade-x-app`

### Passo 2: Esecuzione del Server

Copia il binario sulla macchina di destinazione e avvialo passando il flag `--server`:

```bash
./beyblade-x-app --server
```

* **Porta di ascolto:** Il server si metterà in ascolto sull'indirizzo `0.0.0.0:7878` (accessibile da tutti i dispositivi nella stessa rete).
* **Database SQLite:** Al primo avvio verrà creato automaticamente il database `beyblade_x.db` nella cartella di esecuzione del server.

---

## 4. Build per Desktop (Windows / macOS)

La build desktop genera l'eseguibile installer autoinstallante che conterrà solo l'interfaccia frontend pronta a connettersi al server remoto o locale.

### Compilazione su macOS (genera `.dmg` o `.app`)

```bash
npm run tauri build
```

I file pronti all'uso verranno salvati in `src-tauri/target/release/bundle/dmg/` o `bundle/macos/`.

### Compilazione su Windows (genera `.msi` o `.exe`)

> [!NOTE]
> La build per Windows deve essere eseguita su una macchina fisica o virtuale Windows.

```bash
npm run tauri build
```

I file verranno generati in `src-tauri/target/release/bundle/msi/`.

---

## 5. Build per Mobile (Android / iOS)

La build mobile compila il frontend all'interno di un webview nativo leggerissimo tramite Tauri 2.0 Mobile.

### Prerequisiti per la compilazione mobile

* **Per Android** Installare Android Studio, l'Android SDK, NDK e configurare la variabile d'ambiente `ANDROID_HOME`.
* **Per iOS (solo su Mac)** Installare Xcode, i Command Line Tools e CocoaPods.

### Inizializzazione (da fare una sola volta)

Se le cartelle per la build mobile non sono presenti nel progetto, inizializzale con:

```bash
npx tauri android init
npx tauri ios init
```

### Build di Produzione

#### A. Generare il pacchetto Android (`.apk` o `.aab`)

```bash
npm run tauri android build
```

Il pacchetto compilato (APK per installazione diretta, AAB per Google Play Store) si troverà in:

* `src-tauri/gen/android/app/build/outputs/apk/release/`

#### B. Generare il pacchetto iOS (`.app` o file di Xcode)

```bash
npm run tauri ios build
```

Questo comando compila il codice Rust e genera il progetto Xcode in `src-tauri/gen/ios`. Puoi quindi aprire il progetto con Xcode per firmare l'applicazione con il tuo account sviluppatore Apple e inviarla a TestFlight o generare il file `.ipa`.

---

## 6. Configurazione iniziale al primo avvio

Quando un utente avvia l'app (Desktop o Mobile) per la prima volta:

1. Verrà mostrata la schermata **Configurazione Connessione Backend**.
2. **Server Locale:** Se il server gira sullo stesso computer dell'app desktop, l'utente può cliccare su **Connetti a Server Locale** (connette a `http://localhost:7878`).
3. **Server Remoto / IP Locale:** Se il server è in esecuzione su un altro computer nella rete locale WiFi (o su internet), inserire l'indirizzo IP del server (es: `http://192.168.1.15:7878`) e cliccare su **Connetti**.
4. Spuntando **"Ricorda questo URL"**, l'applicazione salterà questa schermata ai successivi riavvii.

---

## 7. Deployment Sicuro su VPS (Debian/Ubuntu)

Per far girare il backend in modo sicuro su un server pubblico in produzione (es. VPS Linux), segui questi passaggi consigliati:

### Passo 1: Creare un utente di sistema limitato

Non eseguire mai il server come utente `root`. Crea un utente dedicato con permessi ridotti:

```bash
sudo adduser --system --group --home /var/lib/beyblade beyblade
```

Copia il binario release `beyblade-x-app` in `/usr/local/bin/` ed assicurati che sia eseguibile:

```bash
sudo cp beyblade-x-app /usr/local/bin/
sudo chmod +x /usr/local/bin/beyblade-x-app
```

### Passo 2: Configurare un Servizio Systemd

Crea un file di servizio in `/etc/systemd/system/beyblade.service`:

```ini
[Unit]
Description=Beyblade X Backend Server
After=network.target

[Service]
Type=simple
User=beyblade
Group=beyblade
WorkingDirectory=/var/lib/beyblade
ExecStart=/usr/local/bin/beyblade-x-app --server
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Abilita e avvia il servizio:

```bash
sudo systemctl daemon-reload
sudo systemctl enable beyblade
sudo systemctl start beyblade
```

Il database SQLite verrà creato automaticamente e in sicurezza nella home dell'utente (`/var/lib/beyblade/beyblade_x.db`).

### Passo 3: Configurare Nginx come Reverse Proxy + SSL

Per proteggere le comunicazioni e abilitare HTTPS/WSS (WebSocket sicuro), installa Nginx e Certbot:

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx -y
```

Crea un file di configurazione Nginx per il tuo dominio (es: `/etc/nginx/sites-available/beyblade.conf`):

```nginx
server {
    listen 80;
    server_name beyblade.tuodominio.it;

    location / {
        proxy_pass http://127.0.0.1:7878;
        proxy_http_version 1.1;
        
        # Intestazioni richieste per il corretto funzionamento dei WebSocket (Lobby mobile)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Abilita il sito e riavvia Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/beyblade.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Configura Let's Encrypt per ottenere e rinnovare automaticamente il certificato SSL (HTTPS):

```bash
sudo certbot --nginx -d beyblade.tuodominio.it
```

### Passo 4: Proteggere le porte tramite Firewall (UFW)

Assicurati che solo le porte HTTP, HTTPS e SSH siano aperte dall'esterno. UFW bloccherà l'accesso diretto alla porta `7878`, forzando tutto il traffico a passare in sicurezza attraverso la connessione HTTPS crittografata di Nginx:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```

A questo punto, nel client desktop o mobile, dovrai configurare come URL di backend:

`https://beyblade.tuodominio.it` (utilizzando HTTPS invece del vecchio HTTP insicuro).
