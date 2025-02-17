import React, { createContext, useContext, useRef, useState } from "react";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnection = useRef(null);
  const localStream = useRef(null);

  const [userId, setUserId] = useState("");
  const [userName, setUserName] = useState("");
  const [users, setUsers] = useState([]);
  const [remoteUser, setRemoteUser] = useState(null);
  const [isJoined, setIsJoined] = useState(false);
  const [isRemoteStreamAvl, setIsRemoteStreamAvl] = useState(false);

  return (
    <UserContext.Provider
      value={{
        localVideoRef,
        remoteVideoRef,
        peerConnection,
        localStream,
        userId,
        setUserId,
        userName,
        setUserName,
        users,
        setUsers,
        remoteUser,
        setRemoteUser,
        isJoined,
        setIsJoined,
        setIsRemoteStreamAvl,
        isRemoteStreamAvl
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUserContext = () => {
  return useContext(UserContext);
};










// import { createContext, useContext, useState } from "react";

// const UserContext = createContext();

// export const UserProvider = ({ children }) => {
//   const [userId, setUserId] = useState("");
//   const [userName, setUserName] = useState("");
//   const [isJoined, setIsJoined] = useState(false);

//   return (
//     <UserContext.Provider value={{ userId, setUserId, userName, setUserName, isJoined, setIsJoined }}>
//       {children}
//     </UserContext.Provider>
//   );
// };

// export const useUser = () => useContext(UserContext);
