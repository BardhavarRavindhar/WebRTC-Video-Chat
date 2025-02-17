import React from "react";
import { useUserContext } from "../context/UserContext";

export default function JoinRoom({ socket }) {
  const {
      localVideoRef,
      localStream,
      userId,
      setUserId,
      userName,
      setUserName,
      setIsJoined
    } = useUserContext();
  
  const handleChange = (e) => {
    if(e.target.name === "userName"){
      setUserName(e.target.value)
    }else if(e.target.name === "userId"){
      setUserId(e.target.value)
    }
    
  };

  const joinChat = async () => {
    if (!userId || !userName) {
      alert("Enter User ID and Name!");
      return;
    }

    socket.emit("register", { userId, userName });
    setIsJoined(true);

    localStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream.current;
  };

  return (
    <div className="join-room">
      <h2 className="join-room__title">Join Video Chat</h2>
      <div className="join-room__input-row">
        <label className="join-room__label">User ID:</label>
        <input
          type="text"
          placeholder="Enter User ID"
          name="userId"
          value={userId}
          onChange={handleChange}
          className="join-room__input"
        />
      </div>
      <div className="join-room__input-row">
        <label className="join-room__label">User Name:</label>
        <input
          type="text"
          placeholder="Enter User Name"
          name="userName"
          value={userName}
          onChange={handleChange}
          className="join-room__input"
        />
      </div>
      <button onClick={joinChat} className="join-room__button">Join</button>
    </div>
  );
}
