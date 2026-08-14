<div align="center">

# Exam Proctor Extension

**AI-powered exam proctoring, right in your browser.**

A Chrome extension that watches over online exams — live camera and screen monitoring, automatic violation detection, and on-device AI object detection, all without a single frame of video ever leaving the browser for analysis.

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![YOLOv8](https://img.shields.io/badge/AI-YOLOv8-orange)](https://github.com/ultralytics/ultralytics)
[![ONNX Runtime](https://img.shields.io/badge/Inference-ONNX%20Runtime-005CED)](https://onnxruntime.ai/)
[![Firebase](https://img.shields.io/badge/Backend-Firebase-FFCA28?logo=firebase&logoColor=white)](https://firebase.google.com/)

</div>

---

## What it does

- 🤖 **On-device AI detection** — a YOLOv8 model runs fully in-browser via ONNX Runtime, spotting phones, books, extra people, and other flagged objects in real time
- 📊 **Live proctor dashboard** — every connected examinee, their camera/screen status, and a running violation feed in one view, with per-examinee controls
- 🕵️ **Behavioral monitoring** — flags suspicious activity anywhere the examinee's browser goes during the exam: dev-tools shortcuts, tab switching, flagged URLs, and more
- 🧵 **Persistent exam session** — camera and screen sharing run in their own dedicated tab that survives for the whole exam
- 🔐 **Role-based access** — distinct flows for examiners (create & manage exams) and examinees (join & attend)
- ⚡ **Real-time sync** — accounts, exam state, and violations all sync live through Firebase
- 🧪 **Graceful demo mode** — clearly labeled simulated data whenever a live backend isn't connected, instead of silently breaking

## Usage

**As an examiner** — register, create an exam, and share the generated code. A live monitoring dashboard opens automatically with camera/screen feeds, a violation log, and per-examinee controls.

**As an examinee** — register, enter the exam code to join, and enable your camera/screen from the dedicated exam-session tab. Violations are detected and reported to the examiner automatically for the rest of the exam.
