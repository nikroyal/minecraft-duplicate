# 🌐 Voxel Multiplayer Ecosystem & Architecture Blueprint

This document specifies the architecture, data schemas, world modes, social directory, real-time sync, and admin super-permissions matrix for the Voxel Ecosystem.

---

## 🏢 1. World Modes & Storage Models

### 🔒 Mode 1: Private Sandbox (Singleplayer)
- **Target**: `users/{uid}/singleplayer_world` & local storage fallback.
- **Privacy**: Visible and accessible **only** to the owner and the Master Admin.
- **Purpose**: Isolated singleplayer sandbox where players build without interruption or griefing.

### 🌐 Mode 2: Global Nexus World (Permanent Shared World)
- **Target**: `worlds/global_public`
- **Privacy**: Open 24/7 to every registered player. Non-deletable.
- **Purpose**: Community hub for drop-in building, chat, and exploration.

### 👥 Mode 3: Custom Team & Group Rooms
- **Target**: `rooms/{roomId}`
- **Types**:
  - **Public Rooms**: Listed in the live Server Browser directory.
  - **Private / Invite-Only Rooms**: Hidden from the directory. Accessible only via direct invitation or Admin bypass.
- **Room Owner Controls**: Name, Description, Public/Private privacy toggle, member invitations, room deletion.

---

## 👑 2. Master Admin Super-Permissions Matrix

The Master Admin (`role: 'admin'` or `'master'`) possesses unrestricted root access:

| Capability | Description |
| :--- | :--- |
| **Universal Stealth Entrance** | Can enter **ANY** private room, singleplayer world, or invite-only room without invitation. |
| **Room Destruction & Reset** | Can delete or reset any team room, singleplayer save, or global zone. |
| **Live Player Interventions** | Can freeze, kick, ban, teleport, heal, or grant items to any player in real-time. |
| **Global Broadcast Banner** | Send server-wide announcements across all active rooms simultaneously. |

---

## 🎴 3. Player Directory, Profile Cards & Invite System

### 🔍 Searchable Player Directory
- Search players by Email, Username, or Bio keywords.
- Displays real-time online status and current world location.

### 🎴 Player Profile Card
- **Custom Bio**: Profile description (e.g. *"Builder & Redstone Engineer"*).
- **Avatar Preview**: Head/Skin badge representation.
- **Direct Invite Button**: Single-click `[ ✉️ Invite to Room ]`.

### ✉️ Real-time Invite System
- Instant push notification banner to recipient's screen.
- `[ Accept & Join ]` immediately teleports player to the host's room.

---

## 🛠️ 4. Phased Implementation Roadmap

- [x] **Phase 1: Database & Mode Selection UI**: World mode selector (Singleplayer, Nexus, Team Rooms), Room Browser, and Cloud room saving.
- [x] **Phase 2: 3D Multiplayer Player Presence & Avatars**: High-frequency presence broadcasting (100ms), 3D player mesh rendering, walking leg animations, and floating 3D name tags.
- [x] **Phase 3: Player Directory, Profile Cards & Invite System**: Searchable directory modal, profile bio editing, 3D avatar cards, and instant room invite notifications.
- [x] **Phase 4: Admin Super-Dashboard Overhaul**: Master Room Inspector table in Super-Admin Dashboard for stealth direct access, room privacy toggles, and deletion.
