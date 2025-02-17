const socket = io("http://localhost:3000");

let localStream;
let remoteStream;
let peerConnection;
let roomId;

const iceServers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

socket.on("connect", () => console.log("Connected to server:", socket.id));

async function joinRoom() {
  roomId = document.getElementById("roomId").value;
  if (!roomId) {
    alert("Please enter a room ID");
    return;
  }

  socket.emit("join-room", roomId);

  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
}

socket.on("user-joined", async (id) => {
  console.log(`New user joined: ${id}`);

  peerConnection = new RTCPeerConnection(iceServers);
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream; 

  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (event) => {
    console.log("Received remote track");
    event.streams[0].getTracks().forEach((track) => remoteStream.addTrack(track));
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", { roomId, candidate: event.candidate });
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  socket.emit("offer", { roomId, offer });
});

socket.on("offer", async (data) => {
  console.log("Received offer");

  peerConnection = new RTCPeerConnection(iceServers);
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;

  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

  peerConnection.ontrack = (event) => {
    console.log("Received remote track");
    event.streams[0].getTracks().forEach((track) => remoteStream.addTrack(track));
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("ice-candidate", { roomId: data.roomId, candidate: event.candidate });
    }
  };

  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  socket.emit("answer", { roomId: data.roomId, answer });
});

socket.on("answer", async (data) => {
  console.log("Received answer");
  if (peerConnection) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  }
});

socket.on("ice-candidate", async (data) => {
  console.log("Received ICE candidate");
  try {
    if (peerConnection) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  } catch (error) {
    console.error("Error adding received ICE candidate", error);
  }
});

socket.on("user-disconnected", (id) => {
  console.log(`User disconnected: ${id}`);
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
});
