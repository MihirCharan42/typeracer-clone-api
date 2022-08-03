const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io= require("socket.io")(server, {
    cors: {
        origin: "*"
    }
})
let port= process.env.PORT || 3002;

const mongoose=require('mongoose');



const Game = require('./Models/Game');
const QuotableAPI= require('./QuoteableAPI');

mongoose.connect('mongodb+srv://mihircharan42:Password@typeracer-cluster.afpztpt.mongodb.net/?retryWrites=true&w=majority', 
                {useNewURLParser: true, useUnifiedTopology : true},
                () => { console.log('successfully connected to database')});
io.on('connection',(socket)=>{
    socket.on('create-game',async (nickname)=>{
        try {
            const quotableData= await QuotableAPI();
            let game = new Game()
            game.words= quotableData;
            let player = {
                SocketID : socket.id,
                isPartyLeader: true,
                nickName:nickname
            }
            game.players.push(player);
            game=await game.save();
            const gameID = game._id.toString();
            socket.join(gameID);
            io.to(gameID).emit('updateGame',game);
        } catch (err) {
            console.log(err)
        }
    })
    socket.on('join-game', async ({gameID: _id,nickname}) => {
        try {
            let game= await Game.findById(_id);
            if(game.isOpen){
                const gameID = game._id.toString();
                socket.join(gameID);
                let player = {
                    SocketID: socket.id,
                    nickName: nickname
                }
                game.players.push(player)
                game = await game.save();
                io.to(gameID).emit('updateGame',game);
            }
        } catch (err) {
            console.log(err);
        }
    })
    socket.on('timer', async({gameID,playerID}) => {
        let countDown = 5;
        let game= await Game.findById(gameID);
        let player; 
        game.players.forEach(element => {
            if(element.SocketID === playerID)
                player=element;
        })
        if(player.isPartyLeader){
            let timerID= setInterval(async() => {
                if(countDown>= 0){
                    io.to(gameID).emit('timer',{countDown,msg: "Starting Game"});
                    countDown--;
                }
                else {
                    game.isOpen= false;
                    game= await game.save();
                    io.to(gameID).emit('updateGame',game);
                    startGameClock(gameID);
                    clearInterval(timerID);
                }
            },1000);
        }
    });
    socket.on('userInput', async({userInput, gameID})=> {
        try {
            let game = await Game.findById(gameID);
            if(!game.isOpen && !game.isOver){
                let player;
                game.players.forEach(element => {
                    if(element.SocketID === socket.id)
                        player=element;
                })
                let word = game.words[player.currentWordIndex];
                if(word === userInput){
                    player.currentWordIndex++;
                    if(player.currentWordIndex !== game.words.length){
                        game = await game.save();
                        io.to(gameID).emit('updateGame',game);
                    }
                    else{
                        let endTime = new Date().getTime();
                        let {startTime}= game;
                        player.WPM = calculateWPM(endTime,startTime, player);
                        game = await game.save();
                        socket.emit('done');
                        io.to(gameID).emit('updateGame',game);
                    }
                }
            }
        } catch (err) {
            console.log(err);
        }
    });
});

const startGameClock = async(gameID)=> {
    let game = await Game.findById(gameID);
    game.startTime = new Date().getTime();
    game= await game.save();
    let time = 120;
    let timerID= setInterval(function gameIntervalFunction(){
        if(time>= 0){
            const formatTime= calculateTime(time);
            io.to(gameID).emit('timer',{countDown: formatTime, msg: "Time Remaining"});
            time--;
        }
        else{
            (async ()=>{
                let endTime= new Date().getTime();
                let game = await Game.findById(gameID);
                let {startTime} = game;
                game.isOver= true;
                game.players.forEach((player,index)=>{
                    if(player.WPM === -1){
                        game.players[index].WPM = calculateWPM(endTime,startTime,player);
                    }
                });
                game= await game.save();
                io.to(gameID).emit('updateGame',game);
                clearInterval(timerID);
            })()
            
        }
        return gameIntervalFunction;
    }(),1000)
}

const calculateTime = (time) => {
    let minutes = Math.floor(time/60);
    let seconds = time % 60;
    return `${minutes}:${seconds < 10 ? "0"+ seconds:seconds}`;
}

const calculateWPM = (endTime,startTime, player)=>{
    let noOfWords = player.currentWordIndex;
    const timeInSeconds = (endTime - startTime) /1000;
    const timeInMinutes= timeInSeconds/60;
    const WPM = Math.floor(noOfWords/timeInMinutes);
    return WPM;
}

server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});

server.getConnections("/", (req,res) => {
    res.send("Hello");
});
                
