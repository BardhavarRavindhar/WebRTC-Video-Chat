import React, { useEffect } from "react";
import { useUserContext } from "../context/UserContext";

const configuration = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
      ],
    }
  ],
};

export default function VideoChat({ socket }) {
  const {
    localVideoRef,
    remoteVideoRef,
    peerConnection,
    localStream,
    userId,
    userName,
    setUsers,
    remoteUser,
    setRemoteUser,
    isRemoteStreamAvl,
    setIsRemoteStreamAvl
  } = useUserContext();


  const resetPeerConnection = () => {
    if (peerConnection.current) {
      peerConnection.current.onicecandidate = null;
      peerConnection.current.ontrack = null;
      peerConnection.current.close();
      peerConnection.current = null;
    }
  };

  const setupPeerConnection = async (targetUserId) => {
    resetPeerConnection();
    console.log("Initializing new peer connection...");
    peerConnection.current = new RTCPeerConnection(configuration);

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate && remoteUser) {
        console.log("ICE Candidate sent:", event.candidate);
        socket.emit("ice-candidate", { candidate: event.candidate, to: remoteUser });
      }
    };

    peerConnection.current.ontrack = (event) => {
      console.log("Received remote stream:", event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    if (localStream.current) {
      console.log("Adding local tracks...");
      localStream.current.getTracks().forEach((track) => {
        peerConnection.current.addTrack(track, localStream.current);
      });
    }

    setRemoteUser(targetUserId);
  };
  useEffect(() => {
    socket.on("user-list", (users) => {
      setUsers(users.filter((u) => u.userId !== userId));
    });

    socket.on("offer", async ({ offer, from }) => {
      console.log("Received offer from:", from);
      await setupPeerConnection(from);
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      socket.emit("answer", { answer, to: from });
    });

    socket.on("answer", async ({ answer }) => {
      console.log("Received answer");
      // setIsRemoteStreamAvl(false)
      if (peerConnection.current) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      console.log("Received ICE Candidate");
      if (candidate && peerConnection.current) {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    return () => {
      socket.off("user-list");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
    };
  }, [userId]);

  // console.log("isRemoteStreamAvl ", isRemoteStreamAvl);



  return (
    <div className="video-chat">
      <div className="video-chat__local">
        <h3>{userName} (You)</h3>
        <video ref={localVideoRef} autoPlay playsInline muted className="video-chat__video" />
      </div>
      <div className="video-chat__remote">
        <h3>Remote User : {remoteUser}</h3>
        {isRemoteStreamAvl ? (
          <div className="video-chat__video loading_remote" >Loading remote stream...</div>
        ) : (
          <video ref={remoteVideoRef} autoPlay playsInline className="video-chat__video" />)}
      </div>
    </div>
  );
}
