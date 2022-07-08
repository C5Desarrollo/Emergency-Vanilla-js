import * as wss from './wss.js';
import * as constants from './constants.js';
import * as ui from './ui.js';
import * as store from './store.js';

let connectedUserDetails;
let peerConection;
let dataChannel;

const defaultconstraints= {
    audio : true,
    video : true
}

const configuration = {
    iceServers: [
        {
            urls: 'stun:stun.l.google.com:13902'
        }
    ]
}

//Acceder a camaras locales Webrtc
export const getLocalPreview = () => {
    navigator.mediaDevices.getUserMedia(defaultconstraints)
    .then((stream)=>{
        ui.updateLocalVideo(stream);
        ui.showVideoCallButtons();
        store.setCallState(constants.callState.CALL_AVAILABLE);
        store.setLocalStream(stream);
    })
    .catch((err) =>{
        console.log('ocurrio un error al tratar de accesar a la camara');
        console.log(err);
    })
};

const createPeerConnection = () => {
    peerConection = new RTCPeerConnection(configuration);

    dataChannel = peerConection.createDataChannel('chat');

   peerConection.ondatachannel = (event) => {
       const dataChannel = event.channel;

       dataChannel.onopen = () => {
           console.log('peer connections is ready to receive data channel messages');
       }

       dataChannel.onmessage = (event) => {
           console.log('message came from data channel');
           const message = JSON.parse(event.data);
           ui.appendMessage(message);
           console.log(message);
       }
   }; 

    peerConection.onicecandidate = (event) => {
        console.log('getting ice candidates from stun server');
        if (event.candidate){
            // send oir ice candidate to other peer
            wss.sendDataUsingWebRTCSignaling({
                connectedUserSocketId: connectedUserDetails.socketId,
                type:constants.webRTCSignaling.ICE_CANDITATE,
                candidate: event.candidate,
            })
        }
    }

    peerConection.oniceconnectionstatechange = (event) => {
        if (peerConection.connectionState === 'connected'){
            console.log('Conectado exitosamente con otro usuario');
        }
    }

    //Track

    const remoteStream = new MediaStream();
    store.setRemoteStream(remoteStream);
    ui.updateRemoteVideo(remoteStream);

    peerConection.ontrack = (event) => {
        remoteStream.addTrack(event.track);
    }

    if(connectedUserDetails.callType === constants.callType.VIDEO_PERSONAL_CODE || 
        connectedUserDetails.callType === constants.callType.VIDEO_STRANGER){
        const localStream = store.getState().localStream;

        for(const track of localStream.getTracks()){
            peerConection.addTrack(track, localStream);
        }
    }
};


export const sendMessageUsingDataChannel = (message) => {
    const stringfiedMessage = JSON.stringify(message);
    dataChannel.send(stringfiedMessage);
}


export const sendPreOffer = (callType, calleePersonalCode) => {

   connectedUserDetails = {
       callType,
       socketId: calleePersonalCode
   }

   if(callType === constants.callType.CHAT_PERSONAL_CODE || callType === constants.callType.VIDEO_PERSONAL_CODE){
       
          const data = {
              callType,
              calleePersonalCode
           };
           ui.showCallingDialog(callingDialogRejetHandler);
           store.setCallState(constants.callState.CALL_UNAVAILABLE);
           wss.sendPreOffer(data);
   }


   if(callType === constants.callType.CHAT_STRANGER || callType === constants.callType.VIDEO_STRANGER){
       
    const data = {
        callType,
        calleePersonalCode
     };
   
     store.setCallState(constants.callState.CALL_UNAVAILABLE);
     wss.sendPreOffer(data);
}

};

export const handlePreOffer = (data) => {
    const { callType, callerSocketId } = data;

    
    if(!checkCallPossibility()){
        return sendPreOfferAnswer(constants.preOfferAnswer.CALL_UNAVAILABLE, callerSocketId);
    }
    
    connectedUserDetails = {
        socketId: callerSocketId,
        callType,
    };

    store.setCallState(constants.callState.CALL_UNAVAILABLE);


    if (callType === constants.callType.CHAT_PERSONAL_CODE || callType === constants.callType.VIDEO_PERSONAL_CODE){
        ui.showIncomingCallDialog(callType, acceptCallHandler, rejectCallHandler);
    }

    if (callType === constants.callType.CHAT_STRANGER|| callType === constants.callType.VIDEO_STRANGER){
      createPeerConnection();
      sendPreOfferAnswer(constants.preOfferAnswer.CALL_ACCEPTED);
      ui.showCallElements(connectedUserDetails.callType);
    }
};

const acceptCallHandler = () => {
    console.log('llamada aceptada');
    createPeerConnection();
    sendPreOfferAnswer(constants.preOfferAnswer.CALL_ACCEPTED);
    ui.showCallElements(connectedUserDetails.callType);

}

const rejectCallHandler = () => {
    console.log('llamada rechazada');
    sendPreOfferAnswer();
    setIncomingCallsAvailable();
    sendPreOfferAnswer(constants.preOfferAnswer.CALL_REJECTED);
}

const callingDialogRejetHandler = () =>{
    console.log("rechazando llamada");
    const data = {
        connectedUserSocketId: connectedUserDetails.socketId
    }

    closePeerConnectionAndResetState()

    wss.sendUserHangedUp(data);
}

const sendPreOfferAnswer = (preOfferAnswer, callerSocketId = null) => {
    const socketId = callerSocketId ? callerSocketId : connectedUserDetails.socketId;
    const data = {
        callerSocketId: socketId,
        preOfferAnswer,
    };
    ui.removeAllDialogs();
    wss.sendPreOfferAnswer(data);
}

export const handlePreOfferAnswer = (data) => {
    const { preOfferAnswer } = data;
    
    ui.removeAllDialogs();

    if (preOfferAnswer === constants.preOfferAnswer.CALLEE_NOT_FOUND){
        ui.showInfoDialog(preOfferAnswer);
        setIncomingCallsAvailable();
        //show dialog that callee has not been found
    }

    if (preOfferAnswer === constants.preOfferAnswer.CALL_UNAVAILABLE) {
        setIncomingCallsAvailable();
        ui.showInfoDialog(preOfferAnswer);
        // show dialog thath calle is not able to connect
    }

    if(preOfferAnswer === constants.preOfferAnswer.CALL_REJECTED){
        setIncomingCallsAvailable();
        ui.showInfoDialog(preOfferAnswer);
        // shoe dialog that call is rejected by the calle
    }

    if(preOfferAnswer === constants.preOfferAnswer.CALL_ACCEPTED){
        ui.showCallElements(connectedUserDetails.callType);
        createPeerConnection();
        sendWebRTCOffer();
    }

};

const sendWebRTCOffer = async () => {
    const offer = await peerConection.createOffer();
    await peerConection.setLocalDescription(offer);
    wss.sendDataUsingWebRTCSignaling({
        connectedUserSocketId: connectedUserDetails.socketId,
        type : constants.webRTCSignaling.OFFER,
        offer: offer
    })
}

export const handleWebRTCOffer = async (data) => {
    await peerConection.setRemoteDescription(data.offer);
    const answer = await peerConection.createAnswer();
    await peerConection.setLocalDescription(answer);
    wss.sendDataUsingWebRTCSignaling({
        connectedUserSocketId : connectedUserDetails.socketId,
        type: constants.webRTCSignaling.ANSWER,
        answer:answer
    });
};

export const handleWebRTCAnswer = async (data) => {
    console.log('handling rtc answer');
    await peerConection.setRemoteDescription(data.answer);
}

export const handleWebRTCCandidate = async (data) => {
    console.log("handling incoming webRTC Candidate ");
    try {
        await peerConection.addIceCandidate(data.candidate);
    } catch (error) {
        console.log('Ocurrio un error al tratar de agregar recibir ice candidate',
        error);
    }
}

let screenSharingStream;

export const switchBetweenCameraAndScreenSharing = async (screenSharingActive) => {
    if (screenSharingActive) {
        const localStream = store.getState().localStream;
        const senders = peerConection.getSenders();

        const sender = senders.find((sender) => {
            return sender.track.kind === localStream.getVideoTracks()[0].kind;
        })

        if (sender){
            sender.replaceTrack(localStream.getVideoTracks()[0]);
        }

        store.getState().screenSharingStream.getTracks().forEach((track)=> track.stop());

        store.setScreenSharingActive(!screenSharingActive);

        ui.updateLocalVideo(localStream);

    } else {
        console.log('switching for screen sharing');
        try {
            screenSharingStream = await navigator.mediaDevices.getDisplayMedia({
                video: true
            })
            store.setScreenSharingStream(screenSharingStream);

            const senders = peerConection.getSenders();

            const sender = senders.find((sender) => {
                return sender.track.kind === screenSharingStream.getVideoTracks()[0].kind;
            })

            if (sender){
                sender.replaceTrack(screenSharingStream.getVideoTracks()[0]);
            }
            store.setScreenSharingActive(!screenSharingActive);
            ui.updateLocalVideo(screenSharingStream);
        } catch (error) {
            console.log('error ocurred when trying stream',error);
        }
    }
}

// hang up

export const handleHangUp = () => {
    const data = {
        connectedUserSocketId: connectedUserDetails.socketId
    }

    wss.sendUserHangedUp(data);
    closePeerConnectionAndResetState();
}

export const handleConnectedUserHangedUp = () =>{
    closePeerConnectionAndResetState();
}

const closePeerConnectionAndResetState = () => {
    if(peerConection){
        peerConection.close();
        peerConection = null;
    }

    // active mic and camera

    if (connectedUserDetails.callType === constants.callType.VIDEO_PERSONAL_CODE ||
        connectedUserDetails.callType === constants.callType.VIDEO_STRANGER 
        ){
            store.getState().localStream.getVideoTracks()[0].enabled = true;
            store.getState().localStream.getAudioTracks()[0].enabled = true;

        }
        ui.updateUIAfterHangUp(connectedUserDetails.callType);
        setIncomingCallsAvailable();
        connectedUserDetails = null;
}

const checkCallPossibility = (callType) => {
    const callState = store.getState().callState;

    if(callState === constants.callState.CALL_AVAILABLE){
        return true;
    }

    if ((   callType === constants.callType.VIDEO_PERSONAL_CODE || 
            callType === constants.callType.VIDEO_STRANGER) && (
            callState === constants.callState.CALL_AVAILABLE_ONLY_CHAT)
        ){
            return false;
        }

        return false;
}

const setIncomingCallsAvailable = () => {
    const localStream = store.getState().localStream;

    if (localStream){
        store.setCallState(constants.callState.CALL_AVAILABLE);
    }else{
        store.setCallState(constants.callState.CALL_AVAILABLE_ONLY_CHAT);
    }
}