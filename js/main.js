/* ==========================================
   ELEMENTS
========================================== */

const loginPage = document.getElementById("loginPage");
const gamePage = document.getElementById("gamePage");
const lessonPage = document.getElementById("lessonPage");

const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const welcomeName = document.getElementById("welcomeName");

const startLesson = document.getElementById("startLesson");
const backHome = document.getElementById("backHome");

const referenceVideo = document.getElementById("referenceVideo");
const referenceVideoFile = document.getElementById("referenceVideoFile");
const videoMessage = document.getElementById("videoMessage");
const videoName = document.getElementById("videoName");

const referenceCanvas = document.getElementById("referenceCanvas");
const referenceCtx = referenceCanvas.getContext("2d");
const referenceMessage = document.getElementById("referenceMessage");

const userCamera = document.getElementById("userCamera");
const handCanvas = document.getElementById("handCanvas");
const handCtx = handCanvas.getContext("2d");

const cameraMessage = document.getElementById("cameraMessage");
const cameraStatus = document.getElementById("cameraStatus");
const cameraBtn = document.getElementById("cameraBtn");
const checkBtn = document.getElementById("checkBtn");

const handResult = document.getElementById("handResult");
const similarityScore = document.getElementById("similarityScore");
const totalScore = document.getElementById("totalScore");
const nextBtn = document.getElementById("nextBtn");


/* ==========================================
   GAME DATA
========================================== */

const GAME = {
  number: 1,
  title: "สวัสดี",
  description: "ท่ามือใช้กับเพื่อน"
};


/* ==========================================
   LOGIN
========================================== */

loginForm.addEventListener("submit", function(event) {

  event.preventDefault();

  const name = usernameInput.value.trim() || "Nana";

  welcomeName.textContent = name;

  loginPage.classList.add("hidden");
  gamePage.classList.remove("hidden");

});


/* ==========================================
   OPEN LESSON
========================================== */

startLesson.addEventListener("click", function() {

  gamePage.classList.add("hidden");
  lessonPage.classList.remove("hidden");

  resetGame();

});


/* ==========================================
   BACK HOME
========================================== */

backHome.addEventListener("click", async function() {

  await stopCamera();
  stopReferenceDetection();

  lessonPage.classList.add("hidden");
  gamePage.classList.remove("hidden");

});


/* ==========================================
   VIDEO UPLOAD
========================================== */

let referenceVideoURL = null;

referenceVideoFile.addEventListener("change", function() {

  const file = this.files[0];

  if (!file) return;

  if (!file.type.startsWith("video/")) {

    alert("กรุณาเลือกไฟล์วิดีโอ");

    return;

  }

  stopReferenceDetection();

  if (referenceVideoURL) {

    URL.revokeObjectURL(referenceVideoURL);

  }

  referenceVideoURL = URL.createObjectURL(file);

  referenceVideo.src = referenceVideoURL;

  referenceVideo.load();

  videoName.textContent = "คลิป: " + file.name;

  videoMessage.style.display = "none";

  referenceMessage.style.display = "flex";

  referenceMessage.textContent =
    "กดเล่นคลิปเพื่อเริ่มจับจุด";

  handResult.textContent = "โหลดคลิปต้นแบบแล้ว ✓";

});


/* ==========================================
   MEDIAPIPE VARIABLES
========================================== */

let referenceHolistic = null;
let userHolistic = null;

let cameraStream = null;

let cameraRunning = false;
let referenceRunning = false;

let userProcessing = false;
let referenceProcessing = false;

let referenceAnimation = null;
let userAnimation = null;

let latestResults = null;


/* ==========================================
   CREATE HOLISTIC MODEL
========================================== */

function createHolisticModel(callback) {

  const model = new Holistic({

    locateFile: function(file) {

      return (
        "https://cdn.jsdelivr.net/npm/@mediapipe/holistic/" +
        file
      );

    }

  });

  model.setOptions({

    modelComplexity: 1,

    smoothLandmarks: true,

    enableSegmentation: false,

    refineFaceLandmarks: true,

    minDetectionConfidence: 0.5,

    minTrackingConfidence: 0.5

  });

  model.onResults(callback);

  return model;

}


/* ==========================================
   DRAW ALL BODY PARTS
========================================== */

function drawBodyResults(ctx, canvas, results) {

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  const face = results.faceLandmarks;
  const pose = results.poseLandmarks;
  const leftHand = results.leftHandLandmarks;
  const rightHand = results.rightHandLandmarks;

  let found = false;


  // FACE

  if (face) {

    found = true;

    drawConnectors(
      ctx,
      face,
      FACEMESH_CONTOURS,
      {
        color: "#FFD54F",
        lineWidth: 1
      }
    );

    drawLandmarks(
      ctx,
      face,
      {
        color: "#FFD54F",
        radius: 1
      }
    );

  }


  // BODY AND ARMS

  if (pose) {

    found = true;

    drawConnectors(
      ctx,
      pose,
      POSE_CONNECTIONS,
      {
        color: "#00BFFF",
        lineWidth: 3
      }
    );

    drawLandmarks(
      ctx,
      pose,
      {
        color: "#00BFFF",
        radius: 3
      }
    );

  }


  // LEFT HAND

  if (leftHand) {

    found = true;

    drawConnectors(
      ctx,
      leftHand,
      HAND_CONNECTIONS,
      {
        color: "#00FF88",
        lineWidth: 3
      }
    );

    drawLandmarks(
      ctx,
      leftHand,
      {
        color: "#FF3333",
        radius: 3
      }
    );

  }


  // RIGHT HAND

  if (rightHand) {

    found = true;

    drawConnectors(
      ctx,
      rightHand,
      HAND_CONNECTIONS,
      {
        color: "#FF66CC",
        lineWidth: 3
      }
    );

    drawLandmarks(
      ctx,
      rightHand,
      {
        color: "#FF3333",
        radius: 3
      }
    );

  }

  return {
    found: found,
    face: !!face,
    body: !!pose,
    leftHand: !!leftHand,
    rightHand: !!rightHand
  };

}


/* ==========================================
   REFERENCE VIDEO DETECTION
========================================== */

function handleReferenceResults(results) {

  const status = drawBodyResults(
    referenceCtx,
    referenceCanvas,
    results
  );

  if (status.found) {

    referenceMessage.style.display = "none";

  } else {

    referenceMessage.style.display = "flex";

    referenceMessage.textContent =
      "กำลังค้นหาจุดตรวจจับในคลิป...";

  }

}


/* ==========================================
   START REFERENCE DETECTION
========================================== */

async function processReferenceVideo() {

  if (!referenceRunning || !referenceHolistic) return;

  if (
    referenceVideo.readyState >= 2 &&
    !referenceProcessing
  ) {

    referenceProcessing = true;

    try {

      await referenceHolistic.send({
        image: referenceVideo
      });

    } catch(error) {

      console.error("Reference error:", error);

    }

    referenceProcessing = false;

  }

  if (referenceRunning) {

    referenceAnimation =
      requestAnimationFrame(processReferenceVideo);

  }

}


/* ==========================================
   VIDEO PLAY
========================================== */

referenceVideo.addEventListener("loadedmetadata", function() {

  referenceCanvas.width =
    referenceVideo.videoWidth || 640;

  referenceCanvas.height =
    referenceVideo.videoHeight || 480;

  referenceCtx.clearRect(
    0,
    0,
    referenceCanvas.width,
    referenceCanvas.height
  );

  referenceMessage.style.display = "flex";

  referenceMessage.textContent =
    "กดเล่นคลิปเพื่อเริ่มจับจุด";

});


referenceVideo.addEventListener("play", async function() {

  try {

    if (!referenceHolistic) {

      referenceHolistic =
        createHolisticModel(handleReferenceResults);

    }

    referenceRunning = true;

    referenceMessage.style.display = "flex";

    referenceMessage.textContent =
      "กำลังตรวจจับท่าทางจากคลิป...";

    processReferenceVideo();

  } catch(error) {

    console.error(error);

    referenceMessage.textContent =
      "เริ่มระบบตรวจจับไม่ได้";

  }

});


/* ==========================================
   VIDEO PAUSE
========================================== */

function stopReferenceDetection() {

  referenceRunning = false;

  referenceProcessing = false;

  if (referenceAnimation) {

    cancelAnimationFrame(referenceAnimation);

    referenceAnimation = null;

  }

  referenceCtx.clearRect(
    0,
    0,
    referenceCanvas.width,
    referenceCanvas.height
  );

}

referenceVideo.addEventListener("pause", function() {

  stopReferenceDetection();

  if (referenceVideo.currentTime < referenceVideo.duration) {

    referenceMessage.style.display = "flex";

    referenceMessage.textContent =
      "คลิปหยุดชั่วคราว";

  }

});


referenceVideo.addEventListener("ended", function() {

  stopReferenceDetection();

  referenceMessage.style.display = "flex";

  referenceMessage.textContent =
    "คลิปจบแล้ว สามารถเล่นซ้ำได้";

});


/* ==========================================
   USER CAMERA DETECTION
========================================== */

function handleUserResults(results) {

  latestResults = results;

  const status = drawBodyResults(
    handCtx,
    handCanvas,
    results
  );

  if (status.found) {

    cameraMessage.style.display = "none";

    const foundParts = [];

    if (status.face) foundParts.push("ใบหน้า");

    if (status.body) foundParts.push("ลำตัวและแขน");

    if (status.leftHand) foundParts.push("มือซ้าย");

    if (status.rightHand) foundParts.push("มือขวา");

    handResult.textContent =
      "ตรวจพบ: " + foundParts.join(" / ");

    cameraStatus.textContent =
      "ระบบกำลังติดตามตำแหน่งร่างกาย";

    checkBtn.disabled = false;

  } else {

    cameraMessage.style.display = "flex";

    cameraMessage.textContent =
      "ไม่พบร่างกาย กรุณาขยับเข้ากล้อง";

    handResult.textContent =
      "กำลังค้นหาตำแหน่งร่างกาย...";

    cameraStatus.textContent =
      "ยังตรวจไม่พบ";

    checkBtn.disabled = true;

  }

}


/* ==========================================
   PROCESS USER CAMERA
========================================== */

async function processUserCamera() {

  if (!cameraRunning || !userHolistic) return;

  if (
    userCamera.readyState >= 2 &&
    !userProcessing
  ) {

    userProcessing = true;

    try {

      await userHolistic.send({
        image: userCamera
      });

    } catch(error) {

      console.error("Camera detection error:", error);

    }

    userProcessing = false;

  }

  if (cameraRunning) {

    userAnimation =
      requestAnimationFrame(processUserCamera);

  }

}


/* ==========================================
   OPEN / CLOSE CAMERA
========================================== */

cameraBtn.addEventListener("click", async function() {

  if (cameraRunning) {

    await stopCamera();

    return;

  }

  try {

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {

      alert(
        "ไม่สามารถใช้กล้องได้ กรุณาเปิดเว็บไซต์ผ่าน HTTPS"
      );

      return;

    }

    cameraBtn.disabled = true;

    cameraBtn.textContent = "กำลังเปิดกล้อง...";

    cameraStream =
      await navigator.mediaDevices.getUserMedia({

        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 }
        },

        audio: false

      });

    userCamera.srcObject = cameraStream;

    await userCamera.play();

    handCanvas.width =
      userCamera.videoWidth || 640;

    handCanvas.height =
      userCamera.videoHeight || 480;

    userHolistic =
      createHolisticModel(handleUserResults);

    cameraRunning = true;

    cameraMessage.style.display = "none";

    cameraBtn.disabled = false;

    cameraBtn.textContent = "ปิดกล้อง";

    cameraStatus.textContent =
      "เปิดกล้องแล้ว กำลังตรวจจับ";

    processUserCamera();

  } catch(error) {

    console.error(error);

    await stopCamera();

    alert(
      "เปิดกล้องไม่ได้ กรุณาอนุญาตให้เว็บไซต์ใช้กล้อง"
    );

  }

});


/* ==========================================
   CHECK DETECTION
========================================== */

checkBtn.addEventListener("click", function() {

  if (!latestResults) {

    handResult.textContent =
      "ยังไม่มีข้อมูลจากกล้อง";

    return;

  }

  const found = [];

  if (latestResults.faceLandmarks) {
    found.push("ใบหน้า");
  }

  if (latestResults.poseLandmarks) {
    found.push("ลำตัวและแขน");
  }

  if (latestResults.leftHandLandmarks) {
    found.push("มือซ้าย");
  }

  if (latestResults.rightHandLandmarks) {
    found.push("มือขวา");
  }

  if (found.length > 0) {

    handResult.textContent =
      "ตรวจพบแล้ว: " + found.join(", ");

  } else {

    handResult.textContent =
      "ยังตรวจไม่พบ กรุณาจัดตำแหน่งใหม่";

  }

});


/* ==========================================
   STOP CAMERA
========================================== */

async function stopCamera() {

  cameraRunning = false;

  userProcessing = false;

  latestResults = null;

  if (userAnimation) {

    cancelAnimationFrame(userAnimation);

    userAnimation = null;

  }

  if (cameraStream) {

    cameraStream.getTracks().forEach(function(track) {

      track.stop();

    });

    cameraStream = null;

  }

  if (userHolistic) {

    const oldModel = userHolistic;

    userHolistic = null;

    try {

      await oldModel.close();

    } catch(error) {

      console.error(error);

    }

  }

  userCamera.srcObject = null;

  handCtx.clearRect(
    0,
    0,
    handCanvas.width,
    handCanvas.height
  );

  cameraBtn.disabled = false;

  cameraBtn.textContent = "📷 เปิดกล้อง";

  checkBtn.disabled = true;

  cameraMessage.style.display = "flex";

  cameraMessage.textContent =
    "กดเปิดกล้องเพื่อเริ่ม";

  cameraStatus.textContent =
    "ยังไม่ได้เปิดกล้อง";

  handResult.textContent =
    "พร้อมหรือยัง?";

}


/* ==========================================
   RESET GAME
========================================== */

function resetGame() {

  similarityScore.textContent = "--";

  totalScore.textContent = "0";

  handResult.textContent = "พร้อมหรือยัง?";

  cameraStatus.textContent = "ยังไม่ได้เปิดกล้อง";

  nextBtn.disabled = true;

  checkBtn.disabled = true;

  const progressItems =
    document.querySelectorAll(".progress-item");

  progressItems.forEach(function(item, index) {

    item.classList.remove("active");
    item.classList.remove("completed");

    if (index === 0) {

      item.classList.add("active");

    }

  });

}


/* ==========================================
   INITIAL VIDEO STATE
========================================== */

referenceMessage.style.display = "flex";

cameraMessage.style.display = "flex";
