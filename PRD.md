# Product Requirements Document (PRD)
# CALL OF DEITY: PROTOCOL 313 — Tactical Web Browser FPS

> *"When negotiations fail, the Deity calls."*
> *Parodi tajam dari serial Call of Duty yang membalikkan narasi konflik global*

---

## 📋 Ringkasan Eksekutif

**Call of Deity: Protocol 313** adalah game First-Person Shooter (FPS) berbasis web browser yang merupakan parodi dari serial Call of Duty. Game ini membalikkan narasi konflik global: dimana dalam Call of Duty asli, Barat selalu digambarkan sebagai "pahlawan" dan Timur Tengah sebagai "teroris" — dalam game ini, perspektif dibalik.

Semua nama negara dan tokoh diganti dengan nama samaran (aliases) untuk menghindari sensor sekaligus tetap membuat pemain memahami konteks konflik global yang sebenarnya. Subtitle "Protocol 313" merujuk pada jumlah pasukan dalam Perang Badar — simbol kemenangan pasukan kecil melawan pasukan yang jauh lebih besar.

**Platform:** Web Browser (Desktop & Mobile)
**Engine:** Three.js / WebGL
**Genre:** FPS (First-Person Shooter) — Tactical Stealth + Ground Assault
**Art Style:** Low-Poly Stylized (performa optimal untuk web & mobile)
**Rating:** M (Mature — kekerasan perang)

---

### 📜 Store Description (Marketing Copy)

> *"The parody game they were too afraid to make. Play the other side of the protocol."*
>
> When negotiations fail and schools are bombed, the Deity calls. Experience the flip side of the conflict in this tactical low-poly stealth shooter. Lead the elite Farsia units, switch between the Operator and the Overwatch, and dismantle the Zion regime from within.
>
> **They bombed the peace; you bring the storm.**
>
> - 🔫 Tactical FPS with character switching (Wolf & Falcon)
> - 🛸 Summon drones, missiles, and asymmetric warfare tech
> - 🌙 Stealth-first gameplay with detection system
> - 🏜️ Low-poly aesthetic, high-impact action
> - 📖 Story-driven campaign inspired by real global dynamics
> - 🎮 3 missions FREE | 3 premium missions available

### ⚠️ Disclaimer (wajib di game)

> *"This is a work of fiction. All names, characters, and events are entirely fictional. Any resemblance to real persons, nations, or events is coincidental and unintended. This game does not promote violence against any real group or nation."*

---

## 🎯 Visi & Misi

### Visi
Menciptakan game FPS web yang menghibur sekaligus menyampaikan satire tajam tentang dinamika konflik global, bagaimana narasi "pahlawan vs teroris" bisa dibalik ketika kita melihat dari sudut pandang yang berbeda.

### Misi
- Memberikan pengalaman FPS yang seru dan adiktif di web browser
- Menyampaikan pesan tentang hipokrasi media arus utama dalam liputan konflik
- Membuktikan bahwa teknologi web modern (WebGL/Three.js) mampu menghasilkan game FPS yang layak
- Mengedukasi pemain tentang biaya perang dan asimetri kekuatan militer

---

## 🌍 World Building & Lore

### Timeline Alternatif (Alternate Timeline)

```
DUNIA NYATA:                        CALL OF DEITY: PROTOCOL 313
────────────────────────────────────────────────────────────────
USA / The West                      The Colossus (KC) / "The Beacon of Freedom" (ironic)
Israel                              The Zion State (ZS) / "The Citadel"
Iran                                The Federation of Fars (FF) / "Farsia"
IRGC                                Fars Revolutionary Corps (FRC) / "Squad 313"
IDF                                 Iron Defense Force (IDF) — same acronym, different meaning
Mossad                              The Zenith Agency
Hezbollah/Hamas                     Sons of the Crescent (SC)
Iron Dome                           The Celestial Shield (CS) — ironic, "celestial" tapi lemah
Tomahawk / Cruise Missiles          "The Colossus Fists"
F-35 Jets                           "Silent Hawks"
Shahed Drones                       "Martyr Drones" / "Swarm Angels"
```

### Nama Alias Lengkap — Multi-Layer Anti-Sensor

| Nama Asli | Alias Layer 1 (UI) | Alias Layer 2 (Lore) | Alias Layer 3 (Satire) | Kode Radio |
|-----------|-------------------|---------------------|----------------------|------------|
| Amerika Serikat | The Colossus (KC) | Kekaisaran Bizantium Baru | "The Beacon of Freedom" | "Imperium" |
| Israel | The Zion State (ZS) | Benteng Sion | "The Holy Western Order" | "Zion" |
| Iran | Federation of Fars (FF) | Tanah Libero / Persia | — | "Farsia" |
| IRGC | Fars Revolutionary Corps (FRC) | Pasukan Matahari | — | "Squad 313" |
| IDF | Iron Defense Force (IDF) | Tentara Sion | "Steel Shield Alliance" | "Legiun" |
| Mossad | The Zenith Agency | The Eye | — | "Shadow" |
| Iron Dome | Celestial Shield (CS) | Perisai Langit | "Dome of Glass" | "Langit" |
| US Army | Colossus Legion | Legiun Bizantium | — | "Legion" |
| Irak | Two Rivers Federation | Tanah Dua Sungai | — | "Twin River" |
| Suriah | The Sham Province | Tanah Syam | — | "Syam" |
| Lebanon | Cedar Mountains | Gunung Cedar | — | "Cedar" |
| Palestina | The Shattered Lands | Tanah Retak | — | "Retak" |
| Imam Khamenei | The Supreme Guide | Ayah Umat | "Bintang Utara" | — |
| Raisi | Commander of Dawn | Komandan Terang | — | "Fajar" |

### Player Characters — Squad 313

| Character | Codename | Role | Weapon | Description |
|-----------|----------|------|--------|-------------|
| Player A | **WOLF** | The Operator | Assault Rifle + Granat | Front-line fighter, infiltrator |
| Player B | **FALCON** | The Overwatch | Sniper Rifle + Pisau | Long-range support, spotter |

> **Core Mechanic:** Kamu bisa switch antara Wolf dan Falcon kapan saja (tombol Q). 
> Yang tidak dikendalikan akan follow AI sederhana (cover & support fire).

### Narasi Utama

#### Babak 1 — "The Awakening" (Kebangkitan)
The Colossus (KC) dan Benteng Sion (BS) melakukan serangan mendadak ke Tanah Libero (TL). Sebuah sekolah perempuan di Teheran Lama (disebut "Madinah Lama") dibom. 200+ anak perempuan gugur. Ayah Umat (AU), pemimpin spiritual TL, gugur dalam serangan itu.

Kamu adalah **Komandan Fajar**, pemimpin unit khusus "Pasukan Matahari" (PM). Misi: balas dendam dan bebaskan Tanah Libero dari penjajahan.

#### Babak 2 — "The Shadow War" (Perang Bayangan)
Kamu dan pasukanmu menggalang kekuatan dengan "Sons of the Crescent" (SC) dari berbagai tanah. Bersama-sama, kalian mengembangkan teknologi rudal dan drone yang mampu menembus Perisai Langit (PL) milik Benteng Sion.

#### Babak 3 — "The Hammer Falls" (Palu Menghantam)
Teknologi baru (drone kamikaze, rudal hipersonik, rudal balistik) mulai menembus pertahanan. Perisai Langit mulai kehabisan amunisi. Biaya perang KC dan BS mulai menguras kas mereka.

#### Babak 4 — "The Reckoning" (Perhitungan)
Invasi darat terakhir. Kamu memimpin pasukan ground troops merangsek masuk ke wilayah Benteng Sion. Misi final: mengeliminasi para pemimpin perang BS yang bertanggung jawab atas pemboman sekolah.

#### Babak 5 — "New Dawn" (Fajar Baru)
Setelah BS jatuh, KC mulai goyah. Konflik berakhir. Pemenang menulis sejarah — tapi kali ini, ceritanya dari sisi yang berbeda.

---

## 🎮 Gameplay Mechanics

### 1. Core Loop
```
[Deploy] → [Scout/Stealth] → [Switch Characters] → [Execute Tactics]
→ [Engage/Summon Support] → [Complete Objective] → [Extract/Advance]
```

### 2. Movement System
| Aksi | Input Desktop | Input Mobile |
|------|---------------|--------------|
| Bergerak | WASD | Virtual Joystick (kiri) |
| Lihat/Rotasi | Mouse | Swipe (kanan) |
| Lari | Shift | Tombol Sprint |
| Jongkok | C / Ctrl | Tombol Crouch |
| Prone (Tiarap) | X | Tombol Prone |
| Terjun | Space | Tombol Jump |
| Aiming (ADS) | Right Click | Tombol ADS (kanan) |
| Shoot | Left Click | Tombol Shoot (kanan) |
| Switch Character | Q | Tombol Switch (atas) |
| Melee | F | Tombol Melee |
| Reload | R | Tombol Reload |
| Summon | 1-4 | Tombol Summon |

### 3. 🔄 Character Switching System — "The Shadow Duo"

**Wolf (The Operator)**
- Role: Front-line infiltrator, close-mid range combat
- Weapons: Assault Rifle (Zulfiqar-47) + Granat + Pisau
- Ability: Sabotage devices, hacking panels, C4 placement
- Movement: Faster, lebih agresif

**Falcon (The Overwatch)**
- Role: Long-range support, intel gatherer
- Weapons: Sniper Rifle (Shahin-SR) + Pistol + Pisau
- Ability: Tag musuh untuk sync shot, thermal scope (night missions)
- Movement: Lebih lambat, tapi bisa climb ke posisi high-ground

**Switching Mechanics:**
```
Tekan Q → Camera smooth transition ke karakter lain
Karakter lama → Masuk AI mode (cover + follow + suppression fire)
Karakter baru → Full control
```

**Sync Shot System:**
- Falcon bisa tag musuh (max 3 target)
- Switch ke Wolf → Tekan E untuk execute sync shot
- Semua target tertembak bersamaan = Stealth kill

**Tactical Follow AI:**
- Karakter AI akan otomatis mencari cover terdekat
- Jika ada musuh, AI akan menembak (suppression fire)
- AI tidak akan menghabisi musuh sendirian (tetap butuh player)

### 4. 🕵️ Stealth System & Detection Meter

```
DETECTION LEVEL:
  ○ ○ ○ ○ ○  = Undetected (safe)
  ● ○ ○ ○ ○  = Curious (musuh mencari)
  ● ● ○ ○ ○  = Alert (musuh aktif patrol)
  ● ● ● ○ ○  = Hostile (musuh mengejar!)
  ● ● ● ● ●  = Lockdown (semua musuh tahu lokasi kamu!)

SETIAP MUSUH PUNYA INDIKATOR DI ATAS KEPALA:
  [?] = Tidak menyadari
  [!] = Mendengar suara
  [👁] = Melihat kamu (meter naik!)
  [⚠] = Menembak / memanggil bantuan
```

**Stealth Mechanics:**
- Headshot = instant silent kill (jika pakai suppressed weapon)
- Body shot = musuh berteriak sebelum mati (alert nearby)
- Melee dari belakang = silent kill, body bisa di-loot
- Bodies bisa di-hide (drag ke tempat gelap)
- Lampu bisa di-shoot untuk menciptakan bayangan
- Noise = suara tembakan tanpa suppressor terdengar 50m radius

### 5. 🎯 Background War — Atmospheric FX

Karena kamu ground troops, langit harus terasa "hidup" untuk membangun tensi:

**Visual Atmosphere:**
| Elemen | Deskripsi |
|--------|-----------|
| Skybox FX | Jejak asap putih dari interceptor Celestial Shield mengejar drone |
| Missile Trails | Rudal Farsia melesat di langit dengan jejak api oranye |
| Distant Explosions | Ledakan di kejauhan yang membuat layar bergetar sedikit |
| Sirens | Suara sirene kota musuh yang terus berbunyi |
| Smoke Columns | Asap hitam dari target yang sudah dihancurkan |
| Aerial Combat | Sesekali terlihat jet vs drone di atas (visual only, tidak interactif) |

**Audio Atmosphere:**
- Wind gurun konstan (low hum)
- Radio chatter musuh (English accent) yang panik
- Suara Celestial Shield intercepting (sci-fi "pew pew" dari langit)
- Musik中东-influenced yang build tension

### 6. 🤖 The Swarm Radio — Summon Drone System

Kamu punya gadget khusus: **The Swarm Radio**

**Mekanik:**
- Setiap misi dapat summon drone swarm (terbatas)
- Visual: Kamu lihat puluhan drone kecil segitiga terbang dari belakangmu
- Drone menyerang posisi musuh yang kamu tunjuk (target dengan laser pointer)

**Drone Types:**
| Type | Jumlah | Efek | Cooldown |
|------|--------|------|----------|
| Swarm (Angels) | 8-12 drone kecil | Auto-attack musuh terdekar | 45s |
| Kamikaze (Martyr) | 1 drone besar | Terbang ke target, ledakan besar | 60s |
| Recon (Eyes) | 3 drone | Reveal area musuh di minimap | 20s |

**The "David vs Goliath" Aesthetic:**
- Musuh pakai jet tempur canggih, teknologi laser
- Kamu pakai ribuan drone murah tapi efektif
- Celestial Shield kehabisan interceptors karena kamu mengirim terlalu banyak drone
- Biaya perang musuh membengkak karena setiap Celestial Shield interceptor = $50,000+

### 8. 🎯 Senjata & Loadout — "The Farsi Arsenal"

Karena ini stealth tactical, keep it simple: **2 senjata utama + pistol + pisau + 1 gadget**

#### Wolf (The Operator) Loadout:
| Slot | Senjata | Damage | Fire Rate | Ammo | Special |
|------|---------|--------|-----------|------|---------|
| Primary | Zulfiqar-47 (Assault Rifle) | 25 | Medium | 30 | Suppressor option |
| Secondary | Makara-9 (Pistol) | 30 | Fast | 12 | Silenced |
| Melee | Ghurkha Blade | 100 | — | — | Stealth kill |
| Gadget | Signal Jammer | — | — | — | Matikan CCTV/drone 10s |
| Throwable | Smoke Grenade | 0 | — | 2 | Cover / distraction |

#### Falcon (The Overwatch) Loadout:
| Slot | Senjata | Damage | Fire Rate | Ammo | Special |
|------|---------|--------|-----------|------|---------|
| Primary | Shahin-SR (Sniper Rifle) | 90 | Slow | 10 | Suppressed, bullet drop |
| Secondary | Makara-9 (Pistol) | 30 | Fast | 12 | Silenced |
| Melee | Crescent Dagger | 100 | — | — | Stealth kill |
| Gadget | Thermal Scope | — | — | — | Lihat musuh lewat tembok tipis |
| Throwable | C4 Charge | 150 (AoE) | — | 1 | Explosive breach |

#### Weapon Upgrade System:
```
Stock → Suppressor → Extended Mag → Red Dot → Golden Skin (cosmetic)
```
- Unlock upgrade point setiap headshot 10x atau mission completion
- Suppressor: WAJIB untuk stealth. Tanpa suppressor, noise alert radius 50m
- Extended Mag: 30 → 40 peluru
- Red Dot: +10% accuracy saat ADS

### 9. 🚀 Summon System — "The Swarm Radio"

Ini adalah fitur UNIK game ini. Kamu bisa "memanggil" (summon) bantuan militer via Swarm Radio.

#### Tier 1 — Drone Support
| Nama | Deskripsi | Cooldown | Ammo |
|------|-----------|----------|------|
| Swarm Angels | 8-12 drone kecil menyerang area target | 45s | 3 |
| Martyr Drone | 1 drone besar → kamikaze ke target | 60s | 2 |
| Recon Eyes | 3 drone reveal musuh di minimap | 20s | 5 |

#### Tier 2 — Fire Support (Unlock Level 5+)
| Nama | Deskripsi | Cooldown | Ammo |
|------|-----------|----------|------|
| Fateh Salvo | 3 rudal taktis ke area ditandai | 90s | 1 |
| Storm Call | mortar barrage area selama 10 detik | 60s | 2 |

#### Tier 3 — Miracle Weapons (Endgame, Level 10+)
| Nama | Deskripsi | Cooldown | Ammo |
|------|-----------|----------|------|
| Protocol 313 | 313 drone swarm menghujani seluruh map | 300s | 1 |
| Hormuz封锁 | Area denial — zona bahaya di area target | 180s | 1 |

### 10. ⚡ Pertahanan Musuh — "The Celestial Shield" (Iron Dome Parody)

Musuh (The Zion State) memiliki pertahanan kuat:

| Sistem | Efek | Counter |
|--------|------|---------|
| Celestial Shield | Menembak jatuh rudal & drone dari udara | Swarm overload (kirim banyak drone sekaligus) atau rudal hipersonik |
| Sentinel Drones | Drone patrol yang mendeteksi kamu | Signal Jammer atau sniper |
| Auto-Turrets | Turret otomatis di posisi strategis | Hack via panel atau C4 |
| Fortress Mode | Pintu terkunci, lockdown | Cari jalan alternatif atau bom tembok |
| Elite Guards | Musuh bersenjata lengkap | Sync shot atau stealth approach |

**Economy Warfare:**
- Setiap interceptCelestial Shield = $50,000+
- Setiap drone Farsia = ~$20,000
- Strategi: Kirim banyak drone murah → musuh kehabisan interceptor → Celestial Shield jatuh
- Ini adalah **cost asymmetry** — biaya perang musuh membengkak

Musuh (Benteng Sion) memiliki pertahanan kuat:

| Sistem | Efek | Counter |
|--------|------|---------|
| Celestial Shield | Menembak jatuh rudal & drone dari udara | Gunakan rudal hipersonik (Khalij Fars) atau serangan bertubi-tubi |
| Iron Wall | Tembok perisai di beberapa area | Cari pintu masuk alternatif atau pakai rudal penetrasi |
| Sentinel Drones | Drone patrol musuh | Matikan dengan anti-air atau sniper |
| Fortress Mode | Benteng mengunci semua pintu | Cari panel kontrol atau bypass lewat terowongan |

### 11. ❤️ Health & Armor System

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  HP: ████████████░░░░░░░░  60/100                       │
│  ARMOR: ██████████░░░░░░░░  50/100                      │
│  SWARM RADIO: ████░░░░░░░░  40/100 (drone ammo)        │
│  AMMO: 24/30            SUPPRESSOR: [ON]                │
│                                                          │
│  ACTIVE CHAR: [WOLF] (switch: Q)                         │
│  DETECTION: ○ ○ ○ ○ ○  (undetected)                     │
│                                                          │
└──────────────────────────────────────────────────────────┘

- HP: Regen lambat saat tidak damage (hidden, tidak ada medkit)
- Armor: 2 plate max, bisa pickup dari musuh atau crate
- Swarm Radio: Isi dari ammo box atau supply drops
- Detection Meter: Naik jika terdeteksi, turun jika sembunyi
```

### 12. 📈 Progression System

#### Level & XP
```
Level 1: Recruit (Rekrut)           — 0 XP
Level 2: Operative (Operatif)       — 500 XP
Level 3: Specialist (Spesialis)     — 1,200 XP
Level 4: Veteran (Veteran)          — 2,500 XP
Level 5: Commander (Komandan)       — 5,000 XP
Level 6: Elite (Elit)               — 8,000 XP
Level 7: Shadow (Bayangan)          — 12,000 XP
Level 8: Legend (Legenda)           — 18,000 XP
Level 9: Sage (Sage)                — 25,000 XP
Level 10: Immortal (Abadi)          — 35,000 XP
Level 15: Conqueror (Penakluk)      — 60,000 XP
Level 20: Sovereign (Sovereign)     — 100,000 XP
```

#### Unlock System
- Setiap level unlock senjata baru, skin, atau ability
- Blueprint senjata ditemukan di dalam mission (secrets)
- Summon abilities unlock berdasarkan level + mission completion

---

## 🗺️ Map Design & Missions

### 📖 Campaign Structure

**3 FREE Missions + 3 Premium Missions ($9.99)**

---

### 🆓 MISSION 1: "Desert Dawn" (Tutorial)
> *"Execute Protocol 313."*

**Setting:** Sector 313 — Zion Border Wall, 04:45 AM (Subuh)
**Objective:** Sabotage the Border Radar and open the gate for the Farsia Vanguard
**Characters:** Wolf + Falcon (tutorial switching)

#### Detailed Walkthrough:

**Phase 1: The Basics (Movement & Stealth)**
```
 START: Wolf tiarap di balik bukit pasir. Falcon di sampingnya.
 
 RADIO (Command): "Wolf, Falcon. Status report. The Prophet's shadow 
 is with you. Execute Protocol 313."
 
 FALCON: "In position. Border wall is 200 meters ahead. Watch the 
 spotlights, Wolf."
 
 TUTORIAL: Press [X] to Prone, [WASD] to move slowly
 
 ACTION: Merayap melewati area terbuka. Jika kena spotlight → 
 layar memerah → restart checkpoint.
 
 TEACHING MOMENT: Stealth = kunci. Musuh lebih kuat, jangan frontal.
```

**Phase 2: The Switch (Introducing Falcon)**
```
 SITUATION: Sampai di pagar kawat. 2 penjaga menara saling memantau.
 Wolf tidak bisa lewat.
 
 WOLF: "Too many eyes. Falcon, I need a window."
 
 FALCON: "Copy that. Switching to my scope."
 
 TUTORIAL: Press [Q] to Switch to FALCON
 
 ACTION: Camera smooth transition ke posisi Falcon di bukit tinggi.
 
 LEARN: ADS (Aim Down Sights) — Right Click untuk keker
        Shoot — Left Click untuk tembak
        Bullet drop mechanic (peluru turun di jarak jauh)
 
 TARGET: Matikan 2 lampu spotlight atau 2 penjaga menara
         Pakai Silenced Sniper = silent kill
```

**Phase 3: Tactical Entry (The Breach)**
```
 SWITCH BACK ke Wolf (tekan Q)
 
 ACTION: Wolf memotong pagar kawat (animasi pendek).
 
 TUTORIAL: Press [F] untuk Melee Stealth Kill dari belakang
 
 SITUATION: 1 penjaga patroli membelakangi.
 ACTION: Stealth takedown — bunyi "shing" + animation kill
 
 LEARN: Melee dari belakang = silent + loot ammo
```

**Phase 4: The Sabotage (Cinematic Moment)**
```
 SAMPAI di konsol radar.
 
 ACTION: Pasang Hacking Device. Loading bar 10 detik.
 
 CHALLENGE: Sambil nunggu, 2-3 musuh datang mengecek (karena 
 lampu mati). Bertahan!
 
 FALCON (NPC): Otomatis membantu menembak dari bukit.
 Kamu merasa DIBANTU oleh temanmu.
 
 CLIMAX: Radar meledak! Sirine musuh berbunyi kencang.
 
 COMMAND: "Radar is dark! Vanguard, move in! Wolf, Falcon, get 
 out of there before the Jets arrive!"
```

**Phase 5: The Escape (Set-Piece Moment)**
```
 ACTION: Lari ke Jeep yang sudah menunggu.
 
 VISUAL: Di langit (Background), puluhan Suicide Drones 
 (Protocol 313) terbang melewati kepalamu menuju markas Zion.
 
 AESTHETIC: Low-poly drones dengan jejak asap oranye di langit 
 subuh yang mulai biru.
 
 CINEMATIC: Slow-mo saat kamu lompat ke Jeep.
 Radio: "Protocol 313 successful. The storm has begun."
 
 END MISSION 1 → TUTORIAL COMPLETE
```

**Unlock:** Signal Jammer, Suppressor

---

### 🆓 MISSION 2: "Iron Rain" (Urban Warfare)
> *"The city sleeps. We don't."*

**Setting:** Kota kecil perbatasan yang dijadikan basis logistik Zion
**Objective:** Rebut kembali kota dari garnisun Zion
**Characters:** Wolf + Falcon

#### Alur Misi:
```
PHASE 1 — INFILTRASI MALAM
- Masuk lewat saluran air bawah tanah
- Stealth section: elakkan patrol night-vision musuh
- Hancurkan generator listrik untuk memadamkan lampu kota
- Signal Jammer: matikan CCTV di persimpangan

PHASE 2 — URBAN COMBAT (Mirip Map "Crash" di COD)
- Baku tembak jarak dekat di gang-gang sempit
- Switch ke Falcon untuk control high-ground (atap gedung)
- Wolf advance lewat bawah, Falcon cover dari atas
- Gimmick: Kamu bisa memanggil DRONE SWARM untuk pertama kali!

PHASE 3 — THE SABOTAGE
- Sabotase gudang senjata musuh
- Pasang C4 di 3 titik strategis
- Countdown 60 detik → LARI!

PHASE 4 — ESCAPE (Cinematic)
- Semua C4 meledak berurutan di belakangmu
- Slow-mo running scene
- Jet musuh terbang rendah mengejar → drone swarm intercept
- "Iron Rain successfully delivered."
```

**Unlock:** Drone Swarm, C4 Charge, Thermal Scope

---

### 🆓 MISSION 3: "The Nest" (Elimination)
> *"The regime's generals are hiding. Not for long."*

**Setting:** Bunker bawah tanah di bawah istana musuh
**Objective:** Eliminate the 3 generals responsible for the school bombing
**Characters:** Wolf + Falcon

#### Alur Misi:
```
PHASE 1 — INFILTRASI BUNKER
- Masuk lewat terowongan rahasia (revealed di Mission 2)
- Ultra-stealth: lampu merah, alarm radius kecil
- Hack 3 keypad untuk buka jalur
- Falcon: sniper posisi di ventilasi shaft

PHASE 2 — THE HUNTING
- 3 TARGET generals tersebar di 3 sayap bunker
- Kamu bisa pilih urutan elimination
- Setiap general punya bodyguard elite (4-5 musuh)
- Sync shot untuk kill bersamaan

PHASE 3 — MORAL CHOICE (Viral Moment!)
- Setelah 3 general mati, kamu temukan COMMANDER ZION (pemimpin tertinggi)
- Dia terpojok, tidak bersenjata
- Pilihan:
  A) TANGKAP dia → untuk diadili secara terbuka
  B) "SELESAIKAN" → balas dendam atas sekolah
- Choice A: Ending "Justice" → world sees trial, reputasi Zion hancur
- Choice B: Ending "Vengeance" → satisfying tapi duniacondemn kamu

PHASE 4 — ESCAPE BUNKER
- Bunker mulai runtuh (self-destruct sequence)
- Lari keluar sambil tembok roboh
- Falcon: "Wolf, MOVE! We got what we came for!"
```

**Unlock:** Juggernaut Armor (premium mission unlock), Heavy Weapons

---

### 💰 PREMIUM MISSIONS ($9.99)

#### Mission 4: "Silent Thunder" (Airbase Sabotage)
> *"Ground the birds. All of them."*

**Setting:** Pangkalan udara Zion — hanggar jet tempur
**Objective:** Hancurkan Silent Hawks (F-35) agar musuh tidak bisa ngebom balik
**Characters:** Wolf + Falcon + new: VIPER (helicopter pilot NPC)

```
PHASE 1: Stealth masuk lewat perimeter fence
PHASE 2: Plant C4 di sayap 6 jet tempur (hanggar berbeda)
PHASE 3: Alarm triggered! Full combat di hanggar
PHASE 4: Set-piece — lari dari hanggar yang meledak berurutan
         Slow-mo running, efek debris terbang
PHASE 5: Helicopter extraction under fire
```

**Unlock:** Air Strike ability, Jet Crash Cinematic

---

#### Mission 5: "The Command Center" (Cyber Warfare)
> *"Their shield is a lie. We'll prove it."*

**Setting:** Gedung perkantoran modern (Celestial Shield Command Center)
**Objective:** Hack & destroy Celestial Shield dari dalam
**Characters:** Wolf + Falcon + new: ZERO (hacker NPC)

```
PHASE 1: Infiltrasi gedung seperti office building
PHASE 2: Zero membantu bypass firewall (minigame sederhana)
PHASE 3: Controlled demolition — sabotase server room
PHASE 4: DRONE SEGMENT — kamu kendalikan 1 drone kamikaze
         untuk hancurkan antena Celestial Shield di atap gedung
PHASE 5: "Celestial Shield is DOWN!"
         Semua rudal Farsia bisa masuk sekarang
PHASE 6: Evacuate building sebelum hancur
```

**Unlock:** Hack Ability, Drone Camera View

---

#### Mission 6: "Justice Protocol" (The Finale)
> *"This ends now."*

**Setting:** Markas besar Colossus — "The Ivory Tower"
**Objective:** Eliminate the Grand Marshal (pemimpin perang Colossus)
**Characters:** Wolf + Falcon + FULL SQUAD (12 pasukan)

```
PHASE 1: Full assault — semua pasukan menyerbu
PHASE 2: Juggernaut armor untuk Wolf — heavy weapon section
PHASE 3: Boss Fight — Grand Marshal's Elite Guard
         Mereka punya tech canggih: jetpack, shield, laser
PHASE 4: Boss Fight — Mech Guardian
         Robot perang raksasa, multi-phase
PHASE 5: FINAL DUEL — Grand Marshal sendiri
         Dia pakai Golden Sniper (satire)
PHASE 6: MORAL CHOICE REMATCH
         "Justice or Vengeance — again?"

CLOSING CUTSCENE:
- Fade to black
- Teks: "The Colossus fell. The Zion State crumbled.
         History was rewritten — by the survivors."
- Post-credits: Teaser untuk sequel
```

**Unlock:** Golden Weapons, Legendary Skins, "Protocol 313 Veteran" achievement

---

### 🎮 Multiplayer (Future — Post-Launch)

| Map | Setting | Mode |
|-----|---------|------|
| Crimson Bazaar | Kota kuno timur tengah | Team Deathmatch |
| Frozen Frontier | Area pegunungan | Domination |
| Desert Storm | Gurun terbuka | Payload Escort |
| Night Market | Kota malam | Search & Destroy |
| The Wall | Tembok perbatasan | Frontline |

---

## 🎨 Visual Style & Art Direction

### Art Style
- **Semi-realistic** dengan sentuhan **comic/graphic novel** untuk cutscene
- **Low-poly stylized** untuk gameplay (performa web optimal)
- **Color Palette:**
  - Primary: Deep Red (#8B0000), Gold (#FFD700), Desert Sand (#C2B280)
  - Secondary: Midnight Blue (#191970), Olive (#808000), White (#F5F5F5)
  - UI: Dark background (#0D1117), Accent Gold (#FFD700), Alert Red (#FF4444)

### UI Design (HUD)
```
╔══════════════════════════════════════════════════════════╗
║  [Mission: Madinah Lama]              [Score: 2450]     ║
║  ┌─────────────┐                                         ║
║  │   MINIMAP   │           ★ HEADSHOT! +50              ║
║  │   (radar)   │                                         ║
║  └─────────────┘                                         ║
║                                                          ║
║                                                          ║
║         ┌────┐                                           ║
║         │ +  │    ← Crosshair                           ║
║         └────┘                                           ║
║                                                          ║
║                                                          ║
║  HP ████████░░  ARMOR █████░░░░░  AMMO: 24/30           ║
║                                                          ║
║  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                   ║
║  │Q: 🚀 │ │1: 🔫│ │2: 📡│ │R: 💊 │  ← Summon Hotbar  ║
║  └──────┘ └──────┘ └──────┘ └──────┘                   ║
╚══════════════════════════════════════════════════════════╝
```

---

## 🎵 Audio & Sound Design

### Music
|场景 | Style | Tempo |
|-----|-------|-------|
| Menu | Middle Eastern ambient + electronic | Slow (70 BPM) |
| Stealth | Tension drone + percussion | Variable |
| Combat | Aggressive rock + oud/electronic hybrid | Fast (140+ BPM) |
| Boss Fight | Epic orchestral + Middle Eastern choir | Very Fast (160+ BPM) |
| Cutscene | Emotional + cinematic | Slow-Medium |

### Sound Effects (SFX)
- Senjata: Berbasis real-weapon samples (untuk feel Call of Duty)
- Drone buzz: Distinctive high-pitched hum untuk Shahed-136
- Celestial Shield: Sci-fi energy hum + impact sounds
- Explosion: Layered — bass rumble + debris scatter + echo
- Ambience: Gurun wind, radio chatter (Arabic/Farsi-inspired gibberish)

### Voice Acting — "ElevenLabs Generated"

Gunakan ElevenLabs untuk generate semua voice acting. Pilih suara yang tepat:

| Character | Voice Type | Accent | Notes |
|-----------|-----------|--------|-------|
| Wolf | Deep male, calm | American-neutral | Professional soldier |
| Falcon | Medium male, focused | Slight Middle Eastern | Quiet, tactical |
| Command | Female, authoritative | International | Mission control |
| Zion Commander | Male, arrogant | American | Mocking tone |
| Radio Chatter | Various | Mixed | Background chatter |

**Key Dialogue Lines:**
```
WOLF: "Too many eyes. Falcon, I need a window."
FALCON: "Copy that. Switching to my scope."
COMMAND: "Protocol 313 successful. The storm has begun."
ZION: "We have interceptors on standby. Send your drones. We'll swat them all."
WOLF: "Send them all. We have 313 reasons to try."
```

**Radio Chatter (Background, setiap misi):**
```
"Target acquired, grid 313-Alpha"
"Celestial Shield at 40% intercept capacity"
"All stations, Martyr drones inbound from the east"
"The Colossus requesting reinforcements... again"
```

---

## 💻 Technical Requirements

### Tech Stack
| Komponen | Teknologi | Alasan |
|----------|-----------|--------|
| Game Engine | Three.js r158+ | Best WebGL support, large ecosystem |
| Physics | Cannon-es / Rapier | Kollision detection, ragdoll |
| Audio | Howler.js | Cross-browser audio |
| Networking | Socket.io | Multiplayer real-time |
| UI Framework | React / Vanilla DOM | HUD & menus |
| Build Tool | Vite | Fast dev & build |
| Language | TypeScript | Type safety |
| State Management | Zustand | Lightweight game state |

### Architecture
```
┌─────────────────────────────────────────────────────┐
│                    CALL OF DEITY                      │
├─────────────────────────────────────────────────────┤
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Renderer │  │  Physics │  │  Audio   │           │
│  │ (Three.js)│  │ (Rapier) │  │(Howler.js)│          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       │              │              │                  │
│  ┌────┴──────────────┴──────────────┴────┐           │
│  │            Game Engine Core            │           │
│  │   (Scene Manager + Game Loop + ECS)    │           │
│  └────────────────┬──────────────────────┘           │
│                   │                                    │
│  ┌────────────────┴──────────────────────┐           │
│  │          Systems Layer                 │           │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │           │
│  │  │Player│ │Enemy │ │Weapon│ │Summon│ │           │
│  │  │System│ │System│ │System│ │System│ │           │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ │           │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │           │
│  │  │Health│ │Spawn │ │Level │ │ UI   │ │           │
│  │  │System│ │System│ │System│ │System│ │           │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ │           │
│  └──────────────────────────────────────┘           │
│                                                       │
│  ┌──────────────────────────────────────┐           │
│  │          Network Layer (Optional)     │           │
│  │    Socket.io — Multiplayer Co-op      │           │
│  └──────────────────────────────────────┘           │
│                                                       │
└─────────────────────────────────────────────────────┘
```

### Performance Targets
| Metric | Target | Notes |
|--------|--------|-------|
| FPS | 60 FPS | On mid-range PC |
| Mobile FPS | 30-45 FPS | Reduced quality |
| Load Time | < 5s | Initial load |
| Memory | < 500MB | RAM usage |
| Bundle Size | < 15MB | Initial download |

### Rendering Pipeline
- **Deferred Rendering** untuk lighting
- **Shadow Maps** (PCF soft shadows)
- **Bloom** untuk efek ledakan & api
- **Screen Space Reflection** untuk air & metal
- **Instanced Rendering** untuk banyak musuh
- **LOD (Level of Detail)** untuk performa
- **Fog/Atmosphere** untuk depth di gurun

---

## 📱 Responsive Design

### Desktop (Primary)
- Full keyboard + mouse controls
- 1920x1080 (native), scales down to 1280x720
- High quality textures & effects

### Tablet
- Touch controls + optional gamepad
- Medium quality
- Simplified effects

### Mobile
- Virtual joystick + buttons
- Low-medium quality
- Reduced draw distance
- Simplified shadows

---

## 🔒 Anti-Censorship Strategy

### Name Substitution System
Semua nama diganti secara konsisten. Ada beberapa layer:

**Layer 1 — Surface Names (muncul di UI)**
```
The Colossus (KC) ← United States
Benteng Sion (BS) ← Israel
Tanah Libero (TL) ← Iran
```

**Layer 2 — Lore Names (muncul di cutscene & dialogue)**
```
"Kekaisaran Bizantium Baru" ← The Colossus
"Penguasa Laut Putih" ← Western Powers
"Pemeluk Cahaya" ← Free Lands defenders
```

**Layer 3 — Ironic Names (satire)**
```
"Celestial Shield" ← Iron Dome (sarkastik — "celestial" = langit, tapi lemah)
"The Beacon of Freedom" ← US (ironi — klaim freedom tapi agresor)
```

### Content Guidelines
- ❌ TIDAK boleh ada: nama negara real, nama pemimpin real, bendera real
- ❌ TIDAK boleh ada: simbol agama yang diidentifikasi langsung
- ✅ BOLEH ada: satir politik, kritik kebijakan perang, anti-kekerasan pada anak
- ✅ BOLEH ada: referensi halus (tersirat tapi tidak eksplisit)

---

## 💰 Monetization Strategy — "Demo to Full Game"

### Freemium Model (Recommended)

```
FREE (Prologue):
├── Mission 1: Desert Dawn (Tutorial)
├── Mission 2: Iron Rain (Urban Warfare)  
├── Mission 3: The Nest (Elimination)
└── Basic multiplayer (2 maps)

PREMIUM UNLOCK ($9.99):
├── Mission 4: Silent Thunder (Airbase)
├── Mission 5: The Command Center (Cyber)
├── Mission 6: Justice Protocol (Finale)
├── Juggernaut Armor unlock
├── Golden weapon skins
├── 3 additional multiplayer maps
└── "Protocol 313 Veteran" achievement
```

### Psychology of the $9.99 Price Point
Agar pemain merasa harga worth it:
- **3 misi premium jauh lebih epik** (airbase, cyber warfare, final boss)
- **Moral choice endings** = viral moment di social media
- **Unlock Juggernaut Armor** = gameplay experience baru
- **Golden weapons** = status symbol untuk dipamerkan

### Additional Revenue (Optional)
| Item | Harga | Notes |
|------|-------|-------|
| Skin Pack: Desert Ops | $1.99 | 5 weapon skins |
| Skin Pack: Urban Ghost | $1.99 | 5 weapon skins + 2 character skins |
| Voice Pack: Radio Chatter | $0.99 | New radio callouts |
| Emote Pack | $0.99 | Kill celebrations |

### Non-Pay-to-Win Principle
- ❌ NO: Beli senjata lebih kuat
- ❌ NO: Beli summon ammo lebih banyak
- ✅ YES: Beli cosmetic skins, voice packs, emotes
- ✅ YES: Premium missions = full experience, bukan advantage

---

## 📅 Development Roadmap (16 Weeks — Solo Dev)

### Phase 1: Foundation (Minggu 1-4) — "Core Loop"
```
[x] Project setup (Vite + Three.js + TypeScript + Zustand)
[ ] Basic FPS controller (movement, look, shoot, prone)
[ ] Character switching system (Wolf ↔ Falcon)
[ ] Basic weapon: Zulfiqar-47 + Makara-9 pistol
[ ] Basic enemy AI (patrol, detect, alert states)
[ ] Health/damage system
[ ] Basic HUD (HP, ammo, detection meter, minimap)
[ ] Test map: 1 room with walls, cover points, and enemies
[ ] Placeholder assets (colored boxes — focus on gameplay first)
```

### Phase 2: Stealth & Tactics (Minggu 5-8) — "Feel"
```
[ ] Stealth system (detection meter, alert states)
[ ] Melee stealth kill mechanic
[ ] ADS (Aim Down Sights) with bullet drop
[ ] Suppressor toggle
[ ] Falcon: Sniper + thermal scope
[ ] Wolf: C4 + Signal Jammer
[ ] Sync Shot system (Falcon tag + Wolf execute)
[ ] Enemy AI improvements (cover, search, squad tactics)
[ ] Basic HUD polish (crosshair, kill feed, mission text)
[ ] Mobile touch controls (virtual joystick + buttons)
```

### Phase 3: Content — Free Missions (Minggu 9-12) — "Story"
```
[ ] Mission 1: Desert Dawn (Tutorial) — fully playable
[ ] Mission 2: Iron Rain (Urban Warfare) — fully playable
[ ] Mission 3: The Nest (Elimination) — fully playable
[ ] Drone Swarm system (The Swarm Radio)
[ ] Background War atmosphere (skybox, missiles, explosions)
[ ] Cutscenes (simple camera angles + text)
[ ] Sound effects integration
[ ] Background music (tension, combat, stealth)
[ ] Loading screen art
```

### Phase 4: Premium Content & Polish (Minggu 13-16) — "Launch"
```
[ ] Mission 4: Silent Thunder (Premium)
[ ] Mission 5: The Command Center (Premium)
[ ] Mission 6: Justice Protocol (Premium)
[ ] Boss fights
[ ] Moral choice endings
[ ] Voice acting (AI-generated)
[ ] Performance optimization (60fps desktop, 30fps mobile)
[ ] Mobile optimization (reduced quality settings)
[ ] Bug fixing & QA
[ ] Playtesting & balancing
[ ] Deployment to web hosting (itch.io or custom domain)
[ ] Marketing materials (trailer, screenshots, store page)
[ ] LAUNCH! 🚀
```

### Marketing Timeline
```
MONTH 1-2: Teaser clips on social media (#CallOfDeity #Protocol313)
MONTH 3: Alpha testing (limited access)
MONTH 4: Release free version (3 missions)
MONTH 5-6: Marketing push, community building
MONTH 7: Premium missions release ($9.99)
```

---

## 📊 Success Metrics

### Engagement
| Metric | Target (Month 1) | Target (Month 6) |
|--------|-------------------|-------------------|
| DAU (Daily Active Users) | 1,000 | 10,000 |
| Session Duration | 15 min | 20 min |
| Campaign Completion | 40% | 60% |
| Return Rate (D7) | 25% | 35% |
| Multiplayer Matches/Day | 500 | 5,000 |

### Technical
| Metric | Target |
|--------|--------|
| Crash Rate | < 1% |
| Average FPS (Desktop) | 55+ |
| Average FPS (Mobile) | 30+ |
| Load Time | < 5s |
| Lighthouse Performance | 80+ |

### Revenue (if monetization implemented)
| Metric | Target (Month 3) | Target (Month 12) |
|--------|-------------------|---------------------|
| Conversion Rate | 2% | 5% |
| ARPU | $0.50 | $1.50 |
| Battle Pass Subscribers | 200 | 2,000 |

---

## ⚠️ Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Performance issues on low-end devices | High | High | Aggressive LOD, quality settings, target 30fps minimum |
| Political backlash / controversy | Medium | High | Anti-sensor system, clear parody disclaimer, avoid real names |
| Scope creep | High | Medium | Strict MVP definition, phase-gated delivery |
| Web audio restrictions | Medium | Low | User interaction required before audio, fallback to visual |
| Multiplayer networking issues | High | High | Start with co-op PVE (less competitive), dedicated server |
| Browser compatibility | Low | Medium | Target modern browsers only, graceful degradation |
| Content moderation in multiplayer | Medium | Medium | Chat filter, report system, moderated lobbies |

---

## 🤖 AI Tools Stack — "Your Invisible Team"

Karena solo dev, AI adalah "departemen teknis" kamu. Kamu = Sutradara, AI = produksi.

### 🎤 Voice Acting & Audio

| Tool | Kegunaan | Budget |
|------|----------|--------|
| **ElevenLabs** | Voice acting profesional — pilih suara "Middle Eastern" untuk Farsi, "American" untuk Zion | $5-22/bulan |
| **Adobe Podcast (Speech Enhance)** | Bersihkan noise dari rekaman sendiri | Free |
| **Suno AI** | Buat musik cinematic + Middle Eastern instruments | $10/bulan |
| **Udio** | Alternatif musik AI | Free tier available |
| **Freesound.org** | Sound effects gratis (ledakan, angin, sirene) | Free |

**Prompt Example untuk Suno AI:**
```
"Epic cinematic military shooter soundtrack, Middle Eastern oud 
and percussion mixed with orchestral strings, high tension, 
Hans Zimmer style, 140 BPM"
```

### 🎨 Visual & Art

| Tool | Kegunaan | Budget |
|------|----------|--------|
| **Midjourney** | Loading screens, poster art, concept art | $10/bulan |
| **Leonardo.ai** | Texture maps untuk 3D models | Free tier |
| **Recraft.ai** | Vector icons (UI elements, weapon icons) | Free |
| **Blockbench** | Buat low-poly 3D models sendiri | Free |
| **Kenney.nl** | Gratis game assets (models, textures, sounds) | Free |

**Prompt Example untuk Midjourney:**
```
"Cinematic low poly game art, two elite soldiers in desert 
gear at dawn, orange spotlight beams, military tactical vibe, 
Call of Duty style poster, dramatic lighting --ar 16:9 --v 6"
```

### 💻 Coding & Development

| Tool | Kegunaan | Budget |
|------|----------|--------|
| **GitHub Copilot** | Auto-complete GDScript/TypeScript | $10/bulan |
| **Cursor** | AI-powered code editor | Free tier |
| **ChatGPT / Claude** | Debugging, logic design, architecture | Free/$20 |
| **Godot Engine** | Game engine (open source) | Free |
| **Three.js docs** | Web 3D reference | Free |

**Workflow:**
```
1. Tulis naskah dialog → ChatGPT
2. Generate voice-over → ElevenLabs
3. Buat loading screen → Midjourney  
4. Buat 3D assets → Blockbench + Kenney
5. Generate musik → Suno AI
6. Assembly → Godot/Three.js
```

### 📝 Content & Marketing

| Tool | Kegunaan | Budget |
|------|----------|--------|
| **ChatGPT** | Store description, marketing copy | Free |
| **Canva** | Thumbnails, social media posts | Free tier |
| **DaVinci Resolve** | Video editing untuk trailer | Free |

### 💰 Total AI Budget (Estimated)
```
Voice (ElevenLabs):     $5-22/bulan
Music (Suno AI):        $10/bulan  
Art (Midjourney):       $10/bulan
Code (Copilot):         $10/bulan
─────────────────────────────────
TOTAL:                  ~$35-52/bulan (~Rp 500-750rb)
```

> **Tips:** Mulai dengan free tiers dulu. Upgrade hanya saat sudah generating revenue.

---

## 📎 Appendix

### A. Comparable Games (Web-based FPS)
| Game | Tech | Notes |
|------|------|-------|
| Krunker.io | Custom WebGL | Popular FPS browser game |
| Shell Shockers | Three.js | Egg-themed FPS, shows browser FPS is viable |
| Forward Assault Redux | Three.js | Tactical shooter browser port |
| Pixel Gun 3D Web | Custom | Stylized FPS |

### B. Inspiration Sources
- **Call of Duty: Modern Warfare** — Campaign structure, gunplay feel
- **Battlefield** — Large-scale warfare, destruction
- **Metal Gear Solid** — Stealth sections, narrative depth
- **Insurgency: Sandstorm** — Realistic tactical combat
- **Iran's actual military tech** — For summon abilities (Shahed, Fateh, etc.)

### C. Lore Quick Reference
```
"The Colossus" selalu mengklaim diri sebagai "The Beacon of Freedom"
tetapi selalu membom sekolah dan membunuh warga sipil.

"The Zion State" selalu bersembunyi di balik "Celestial Shield"
yang dibiayai oleh uang pajak rakyat The Colossus.

"The Federation of Fars" hanya bertahan hidup dan melindungi rakyatnya.
Squad 313 (kamu) membalas demi anak-anak yang gugur di Madinah Lama.

"The Supreme Guide" gugur, tetapi semangatnya hidup dalam setiap pejuang.
```

### D. Gemini Brainstorming Summary

Key ideas dari brainstorming sebelumnya yang sudah terintegrasi:

| Idea | Status | Section |
|------|--------|---------|
| Character Switching (Wolf & Falcon) | ✅ Integrated | Gameplay Mechanics §3 |
| Stealth System + Detection Meter | ✅ Integrated | Gameplay Mechanics §4 |
| Background War Atmosphere | ✅ Integrated | Gameplay Mechanics §5 |
| Swarm Radio / Drone Summon | ✅ Integrated | Gameplay Mechanics §6, §9 |
| Simple Weapon Loadout | ✅ Integrated | Gameplay Mechanics §8 |
| Mission 1-6 Detailed Design | ✅ Integrated | Map Design |
| 3+3 Free/Premium Model | ✅ Integrated | Monetization |
| AI Tools Stack | ✅ Integrated | AI Tools Section |
| Moral Choice Endings | ✅ Integrated | Mission 3 & 6 |
| "David vs Goliath" Cost Warfare | ✅ Integrated | Economy Warfare |
| Anti-Sensor Name Strategy | ✅ Integrated | Anti-Censorship |
| Subtitle "Protocol 313" | ✅ Integrated | PRD Title |
| Store Description / Marketing | ✅ Integrated | Store Description |
| Low Poly Aesthetic | ✅ Integrated | Art Style |

---

*Document Version: 2.0*
*Created: 2025*
*Updated: 2025 — Integrated Gemini brainstorming*
*Status: READY FOR DEVELOPMENT*

---

> *"Dalam perang, yang pertama kali bercerita sebagai pahlawan bukanlah yang benar — 
> tapi yang selamatlah yang menulis sejarah."*
> — Komandan Fajar, Call of Deity
