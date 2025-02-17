



import React, { useEffect} from "react";
import io from "socket.io-client";
import { useUserContext } from "../context/UserContext";
import JoinRoom from "./JoinRoom";
import UserList from "./UserList";
import VideoChat from "./VideoChat";


const socket = io("http://localhost:8000");


export default function WebRTCMain() {
  const { isJoined } = useUserContext();


  return (
    <div className="app">


      {!isJoined ? (
        <JoinRoom  socket={socket}/>
      ) : (
        <div className="app__chat-container">
          <h2>WebRTC Video Chat</h2>

          <UserList socket={socket} />
          <VideoChat socket={socket} />

          

        </div>
      )}
    </div>
  );
}


