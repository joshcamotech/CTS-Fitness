# 🏋️ CTS Fitness

A clean, minimal gym progress tracking app — **React Native (Expo)** mobile frontend backed by **Supabase** (Postgres + Auth + Row Level Security).

---

## Project Structure

```
Gym App/
├── supabase/         ← Postgres schema, migrations, RLS policies
│
├── mobile/           ← React Native (Expo) app
│   ├── App.tsx
│   ├── src/
│   │   ├── screens/
│   │   │   ├── HomeScreen.tsx       ← Weekly view
│   │   │   ├── DayDetailScreen.tsx  ← Day's exercises
│   │   │   └── AddExerciseScreen.tsx
│   │   ├── components/
│   │   ├── services/api.ts          ← API calls
│   │   ├── config/index.ts          ← API URL config
│   │   ├── constants/colors.ts
│   │   ├── types/index.ts
│   │   └── utils/dateUtils.ts
│   └── package.json
│
└── README.md
```

---

## ☁️ Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run the SQL in `supabase/schema.sql` and `supabase/migrations/` (in order) via the Supabase SQL editor
3. Copy your project's URL and anon key into `mobile/.env`:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
   ```

Row Level Security is enabled on every table — access control is enforced in Postgres, not the client.

---

## 🚀 Running Locally

React Native 0.88 and Metro declare `node: ^22.13.0 || ^24.3.0 || >= 26`.
Older versions only warn on install, but are untested — use **Node 22.13+**.

```bash
cd mobile
npm install
npx expo start
```

Then:
- Press **`a`** to open Android emulator
- Press **`i`** to open iOS simulator  
- Scan the QR code with the **Expo Go** app on your phone

---

## ✨ Features

| Feature | Details |
|---------|---------|
| **Weekly view** | Mon–Sun grid showing exercise count per day |
| **Week navigation** | ← → arrows to browse any past or future week |
| **Week number** | ISO week number shown prominently |
| **Log exercise** | Name, sets, reps (optional), weight, KG/LBS toggle |
| **Edit exercise** | Tap any exercise to edit it in-place |
| **Delete exercise** | Swipe-style delete with confirmation |
| **Unit memory** | Remembers your last used unit (KG or LBS) |
| **Notes field** | Optional per-exercise notes |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native + Expo SDK 58 |
| Navigation | React Navigation v7 |
| Backend | Supabase (Postgres + Auth + RLS) |
| Distribution | EAS Update / EAS Build |
