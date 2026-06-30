# 🛠️ SnapFix

> AI-powered community maintenance platform connecting residents with nearby professionals in real time.

![React](https://img.shields.io/badge/React-19-blue?logo=react)
![Firebase](https://img.shields.io/badge/Firebase-Google-orange?logo=firebase)
![Gemini](https://img.shields.io/badge/Gemini-2.0%20Flash-blueviolet)
![Cloudinary](https://img.shields.io/badge/Cloudinary-Image%20Hosting-blue)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 📖 Overview

SnapFix is an AI-powered maintenance platform that helps residential communities report and resolve maintenance issues quickly.

Residents simply upload a photo and describe the problem. Gemini AI automatically identifies the issue category, estimates its severity, and generates a concise summary. The appropriate professional receives an instant notification and can accept the job in real time.

The platform supports three user roles:

- 👤 Resident
- 👨‍🔧 Professional
- 🛡️ Admin

From reporting to resolution, every step is tracked live.

---

## 🚀 Features

### 🤖 AI Issue Classification

Powered by **Gemini 2.0 Flash**, the system analyzes uploaded images and descriptions to determine:

- Issue category
- Severity level
- AI-generated summary

---

### 📸 Photo Upload

Residents can upload issue photos securely using **Cloudinary**.

---

### 🔔 Real-Time Professional Ring

When an issue is created:

- Relevant professionals receive a full-screen alert
- Countdown timer
- Ring animation
- Audio notification
- Instant accept/reject

Powered by Firebase Realtime Database.

---

### 📊 Live Status Tracking

Track every maintenance request through multiple stages:

```
Reported
    ↓
Accepted
    ↓
En Route
    ↓
Arrived
    ↓
In Progress
    ↓
Resolved
```

---

### 👥 Role-Based Dashboards

#### Resident

- Report issues
- Upload photos
- Track live status
- View issue history
- Rate professionals

#### Professional

- Receive instant job alerts
- Accept or reject requests
- Update work progress
- View assigned jobs

#### Admin

- Monitor all issues
- View professionals
- Assign jobs manually
- Handle escalated requests
- Track completed work

---

### ⭐ Rating & Feedback

Residents can rate professionals after issue resolution.

Ratings are visible across dashboards to improve transparency and accountability.

---

### ⏳ Automatic Escalation

If no professional accepts a request within **10 minutes**, the issue is automatically escalated to the admin dashboard.

---

## 🏗️ Tech Stack

### Frontend

- React
- Vite
- CSS

### Backend & Services

- Firebase Authentication
- Firebase Firestore
- Firebase Realtime Database
- Cloudinary

### AI

- Gemini 2.0 Flash API

### Hosting

- Firebase Hosting
- Netlify

---

## 🛠️ Google Technologies

- Gemini 2.0 Flash API
- Firebase Authentication
- Firebase Firestore
- Firebase Realtime Database
- Firebase Hosting
- Google Cloud Platform

---

## 📂 Project Structure

```
src/
│
├── components/
├── pages/
├── hooks/
├── context/
├── firebase/
├── services/
├── assets/
└── App.jsx
```

---

## ⚙️ Installation

Clone the repository

```bash
git clone https://github.com/Palakvirk/snapfix.git
```

Move into the project

```bash
cd snapfix
```

Install dependencies

```bash
npm install
```

Start the development server

```bash
npm run dev
```

---

## 🔐 Environment Variables

Create a `.env` file and add:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_CLOUDINARY_CLOUD_NAME=
VITE_GEMINI_API_KEY=
```

---

## 🌐 Live Demo

https://fastidious-lokum-511463.netlify.app

---

## 💻 GitHub Repository

https://github.com/Palakvirk/snapfix

---

## 🎯 Future Improvements

- Google Maps integration
- Push notifications
- ETA tracking
- AI safety recommendations
- Predictive maintenance
- Community announcements
- Multi-language support

---

## 👩‍💻 Author

**Palak Virk**

B.Tech CSE Student

Built with ❤️ using React, Firebase and Google Gemini.
