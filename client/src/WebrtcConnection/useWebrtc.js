import { useRef, useState } from "react";
import socketManager from "../socketManager/SocketManager";

// const configuration = {
//   iceServers: [
//     {
//       urls: [
//         'stun:stun.l.google.com:19302',
//         'stun:global.stun.twilio.com:3478',
//         'stun:stun1.l.google.com:19302',
//         'stun:stun2.l.google.com:19302',
//         'stun:stun3.l.google.com:19302',
//         'stun:stun4.l.google.com:19302',
//         'stun:stun.vodafone.ro:3478',
//         'stun:stun.skylink.ru:3478',
//         // "stun:3.14.25.16:3478",
//         // "stun:3.14.25.16:3479",
//         // "stun:3.14.25.16:3480",
//       ],
//     },
//   ],
// };

const configuration = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
      ],
    },
    {
      urls: ["turn:turn.fiellements.com", "turns:turn.fiellements.com"],
      username: "fiwebRTC",
      credential: "fiwebRTC@123",
    },
  ],
};

const mediaConstraints = { video: true, audio: true };

const useWebRTC = () => {
  const [localStream, setLocalStream] = useState(null);
  // const [remoteStream, setRemoteStream] = useState(null);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const peerConnections = useRef({});
  const mediaRecorder = useRef(null);

  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        mediaConstraints
      );
      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error("Error getting local stream:", error);
    }
  };

  const createPeerConnectionCreator = async (localStream, userId, mainRoom) => {
    const pc = new RTCPeerConnection(configuration);

    if (localStream && localStream.getTracks().length > 0) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    } else {
      console.log("No valid tracks in the local stream.");
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketManager.sendIceCandidate(
          userId,
          event.candidate,
          mainRoom,
          "artist"
        );
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("ICE Connection State sender:", pc.iceConnectionState);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketManager.sendOffer(userId, offer, mainRoom);
    peerConnections.current[userId] = pc;
  };

  // Disconnect the peer connection for a particular userId
  const disconnectUser = (userId) => {
    const peerConnection = peerConnections.current[userId];
    if (peerConnection) {
      peerConnection.close(); // Close the connection
      delete peerConnections.current[userId]; // Clean up the peer connection
      console.log(`Disconnected user: ${userId}`);

      // Optionally notify the signaling server
      // socketManager.sendUserDisconnected(userId);
    } else {
      console.log(`No peer connection found for user: ${userId}`);
    }
  };

  // const createPeerConnectionJoinner = async (creatorId, offer) => {
  //   const pc = new RTCPeerConnection(configuration);

  //   pc.onicecandidate = (event) => {
  //     if (event.candidate) {
  //       socketManager.sendIceCandidate(creatorId, event.candidate);
  //     }
  //   };

  //   pc.oniceconnectionstatechange = () => {
  //     console.log('ICE Connection State Receiver:', pc.iceConnectionState);
  //   };

  //   pc.ontrack = (event) => {
  //     if (event.streams && event.streams[0]) {
  //       setRemoteStream(event.streams[0]);
  //     }
  //   };

  //   try {
  //     await pc.setRemoteDescription(new RTCSessionDescription(offer));
  //     const answer = await pc.createAnswer();
  //     await pc.setLocalDescription(answer);
  //     socketManager.sendAnswer(creatorId, answer);
  //     peerConnections.current[creatorId] = pc;
  //   } catch (error) {
  //     console.error('Error setting remote description:', error);
  //   }
  // };

  const toggleAudio = (isAudio, localStream) => {
    if (localStream && localStream.getAudioTracks) {
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks.forEach((track) => {
          track.enabled = isAudio;
        });
        console.log(
          `Audio ${isAudio ? "enabled" : "disabled"} for ${
            audioTracks.length
          } track(s).`
        );
      } else {
        console.warn("No audio tracks found in the localStream.");
      }
    } else {
      console.error("Invalid localStream or no audio tracks available.");
    }
  };

  const handleSignalingData = async (data) => {
    const { type, userId, answer, candidate } = data;

    switch (type) {
      case "answer":
        if (peerConnections.current[userId]) {
          const pc = peerConnections.current[userId];
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
        }
        break;

      case "icecandidate":
        const iceCandidate = new RTCIceCandidate(candidate);
        if (peerConnections.current[userId]) {
          const pc = peerConnections.current[userId];
          pc.addIceCandidate(iceCandidate);
        }
        break;

      default:
        break;
    }
  };

  const switchCamera = (localStream) => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks()[0];
      videoTracks._switchCamera();
      // videoTracks.forEach((track) => {
      //   track._switchCamera();
      // });
    }
  };

  const startRecording = (localStream) => {
    if (localStream) {
      mediaRecorder.current = new MediaRecorder(localStream);
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setRecordedChunks((prev) => [...prev, event.data]);
        }
      };
      mediaRecorder.current.start();
      setIsRecording(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current) {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  };

  const saveRecording = () => {
    if (recordedChunks.length > 0) {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "recording.webm";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const cleanUp = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        track.stop();
      });
      setLocalStream(null);
    }
    closeAllConnections();
  };

  const closeAllConnections = () => {
    Object.keys(peerConnections.current).forEach((id) => {
      const pc = peerConnections.current[id];
      if (pc) {
        pc.getSenders().forEach((sender) => {
          if (sender.track) {
            sender.track.stop();
          }
        });
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.oniceconnectionstatechange = null;
        pc.onremovetrack = null;
        pc.onsignalingstatechange = null;
        pc.close();
        delete peerConnections.current[id];
      }
    });
    peerConnections.current = {};
  };

  return {
    localStream,
    // remoteStream,
    startLocalStream,
    createPeerConnectionCreator,
    // createPeerConnectionJoinner,
    toggleAudio,
    handleSignalingData,
    switchCamera,
    startRecording,
    stopRecording,
    saveRecording,
    isRecording,
    cleanUp,
    disconnectUser,
  };
};

export default useWebRTC;
