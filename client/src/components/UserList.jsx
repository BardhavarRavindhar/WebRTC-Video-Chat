import React from "react";
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

export default function UserList({ socket }) {
  const {
      remoteVideoRef,
      peerConnection,
      localStream,
      users,
      remoteUser,
      setRemoteUser,
      userId,
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
      // setIsRemoteStreamAvl(true);
      peerConnection.current = new RTCPeerConnection(configuration);
  
      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate && remoteUser) {
          console.log("ICE Candidate sent:", event.candidate);
          socket.emit("ice-candidate", { candidate: event.candidate, to: remoteUser });
        }
      };
  
      peerConnection.current.ontrack = (event) => {
        console.log("Received remote stream:", event.streams[0]);
        // setIsRemoteStreamAvl(false)
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

    const callUser = async (targetUserId) => {
      console.log("Calling user:", targetUserId);
      await setupPeerConnection(targetUserId);
  
      console.log("Creating offer...");
      const offer = await peerConnection.current.createOffer();
  
      // **Ensure ICE candidates are collected before sending the offer**
      await peerConnection.current.setLocalDescription(offer);
  
      console.log("Waiting for ICE gathering to complete...");
      
      // socket.emit("calling", {  to: targetUserId , from: userId, })
      await new Promise((resolve) => {
        peerConnection.current.onicegatheringstatechange = () => {
          if (peerConnection.current.iceGatheringState === "complete") {
            resolve();
          }
        };

      });
  
      console.log("Sending offer to:", targetUserId);
      socket.emit("offer", { offer: peerConnection.current.localDescription, to: targetUserId });
    };
  return (
    <div className="user-list">
            <h3 className="user-list__title">Available Users</h3>
            <ul className="user-list__list">
              {users?.length > 0 ? users.map((user) => (
                <li key={user.userId} className="user-list__item">
                  <p className="user-list__name">{user.userName} ({user.userId})</p>
                  <button className="user-list__button" onClick={() => callUser(user.userId)}>Call</button>
                </li>
              )) : (
                <div>No User Available</div>
              )}
            </ul>
          </div>
  );
}
