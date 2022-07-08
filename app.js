// var fs = require('fs');
// var https = require('https');
// var privateKey  = fs.readFileSync('/etc/ssl/private/50-116-6-25.ip.linodeusercontent.com.key', 'utf8');
// var certificate = fs.readFileSync('/etc/ssl/certs/50-116-6-25.ip.linodeusercontent.com.crt', 'utf8');
// var credentials = {key: privateKey, cert: certificate};

const express = require('express');
const http = require("http");

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);

app.use(express.static("public"));

app.get('/', (req, res)=>{
    res.sendFile(__dirname + '/public/index.html');
});

let connectedPeers = [];
let connectedPeersStrangers = [];

io.on('connection', (socket)=> {
    connectedPeers.push(socket.id);
    // console.log(connectedPeers);

    socket.on('pre-offer', (data)=> {
        console.log('pre-offer-came');
        const { calleePersonalCode, callType } = data;
        console.log(calleePersonalCode);
        console.log(connectedPeers);
        const connectedPeer = connectedPeers.find((peerSocketId) => {
           return peerSocketId === calleePersonalCode;
        });
        
        console.log(connectedPeer);

        if (connectedPeer) {
            const data = {
                callerSocketId: socket.id,
                callType,
            };

            io.to(calleePersonalCode).emit('pre-offer', data);
        }else{
            const data = {
                preOfferAnswer: 'CALLEE_NOT_FOUND',
            }
            io.to(socket.id).emit('pre-offer-answer',data);
        }
    })

    socket.on('pre-offer-answer',(data) => {
        console.log('pre offer answer came');
        console.log(data);

        const {callerSocketId} = data;

        const connectedPeer = connectedPeers.find((peerSocketId) => {
            return peerSocketId === callerSocketId;
         });

         if (connectedPeer){
             io.to(data.callerSocketId).emit('pre-offer-answer',data);
         }
    });

 

    socket.on('webRTC-signaling', (data)=>{
        const { connectedUserSocketId } = data;

        const connectedPeer = connectedPeers.find((peerSocketId) => {
            return peerSocketId === connectedUserSocketId;
         });

         if(connectedPeer){
             io.to(connectedUserSocketId).emit('webRTC-signaling',data);
         }
    });

    socket.on('user-hanged-up', (data)=>{
        const { connectedUserSocketId } = data;

        const connectedPeer = connectedPeers.find((peerSocketId) => {
            return peerSocketId === connectedUserSocketId;
         });


        if( connectedPeer ){
            io.to(connectedUserSocketId).emit("user-hanged-up");
        }
    });

    socket.on('stranger-connection-status', (data) => {
        const { status } = data;
        
        if ( status ) {
            connectedPeersStrangers.push(socket.id);
        } else {
            const newConnectedPeersStragers = connectedPeersStrangers.filter(peerSocketId => peerSocketId !== socket.id);

            connectedPeersStrangers = newConnectedPeersStragers;
        }

        console.log(connectedPeersStrangers);
    })

    socket.on('get-stranger-socket-id', () => {
        let randomStrangerSocketId;
        const filteredConnectedPeersStrangers = connectedPeersStrangers.filter((peerSocketId) => peerSocketId !== socket.id);
        if (filteredConnectedPeersStrangers.length > 0){
            randomStrangerSocketId = filteredConnectedPeersStrangers[
                Math.floor(Math.random() * filteredConnectedPeersStrangers.length)
            ];
        }else{
            randomStrangerSocketId = null;
        }

        const data = {
            randomStrangerSocketId
        };

        io.to(socket.id).emit('stranger-socket-id', data);
    });


    socket.on('disconnect', ()=> { 
        // console.log("Usuario Desconectado"+ socket.id);

        const newConnectedPeers= connectedPeers.filter((usuarioSocketId)=>{
           return usuarioSocketId !== socket.io
        });

        connectedPeers = newConnectedPeers;
        // console.log(connectedPeers);

        const newConnectedPeersStragers = connectedPeersStrangers.filter(peerSocketId => peerSocketId !== socket.id)
        connectedPeersStrangers = newConnectedPeersStragers;
    });
});

server.listen(PORT, ()=>{
    console.log(`listening on ${PORT}`);
});