# Exam Proctor Extension

A Chrome extension for monitoring exams using the YOLO object detection model. It helps proctors keep an eye on examinees by detecting objects like phones, books, or multiple people in the frame.

## Features

*   **Real-time Object Detection**: Uses YOLO v8 to spot things like cell phones, books, etc.
*   **Role-Based Access**: Separate views for Examiners (create exams) and Examinees (join exams).
*   **Live Monitoring**: Examiners can see live feeds and get alerts for violations.
*   **Secure**: Built on Firebase for auth and realtime database interactions.


## Usage

*   **Admin/Examiner**: Sign up, create an exam, and share the code with students.
*   **Student**: Enter the exam code to join. You'll need to allow camera and screen sharing permissions.

## Tech Stack
*   **Frontend**: HTML, CSS, JavaScript
*   **AI/ML**: YOLO v8 (ONNX runtime)
*   **Backend**: Firebase (Auth, Firestore, Functions)
* 
