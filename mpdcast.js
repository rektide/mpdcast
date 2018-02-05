#!/usr/bin/env node
"use strict"


var
  defer= require( "p-defer"),
  fetch= require( "node-fetch"),
  fs= require( "fs"),
  mpd= require( "mpd"),
  path= require( "path"),
  playlistParser= require( "playlist-parser"),
  promisify= require( "es6-promisify"),
  yargs= require( "yargs")

function getArgs( argv){
	argv= argv|| process.argv
	return yargs(argv)
		.env( "MPD")
		.usage( "Usage: $0 [urls...]")

		// mpdcast group
		.option( "playlist", {
			alias: "p",
			describe: "add to this playlist (defaults to current playing)",
			group: "mpdcast",
		})
		.option( "num", {
			alias: "n",
			describe: "limit maximum number of entries to enqueue",
			group: "mpdcast",
			number: true,
		})
		.option( "start", {
			alias: "s",
			default: true,
			describe: "start this track now",
			group: "mpdcast",
			boolean: true,
		})

		// mpd group
		.option( "host", {
			default: "localhost",
			describe: "mpd host to connect to",
			group: "mpd",
		})
		.option( "port", {
			alias: "P",
			default: "6600",
			describe: "mpd port to connect to",
			group: "mpd",
			number: true,
		})
		.option( "password", {
			describe: "mpd password to use",
			group: "mpd",
		})

		// help 
		.help("h")
		.alias("h", "help")
		.group("help", "help")
		.option( "verbose", {
			alias: "v",
			count: true,
			describe: "show extra info",
			group: "help",
		})

		.argv
}

/**
 * Load a file or url. If that file has a playlist suffix, recursively load it's entries.
 */
function load(entry, args){
	var ext= path.extname( entry).toLowerCase().substring(1)
	var q= ext.indexOf( "?")
	if( q != -1){
		ext= ext.substring(0, q)
	}
	var playlist
	if( ext == "pls"){
		playlist= loadPlaylist(entry, ext, args)
	}else if( ext == "m3u"){
		playlist= loadPlaylist(entry, ext, args)
	}else if(ext == "asx"){
		playlist= loadPlaylist(entry, ext, args)
	}
	if(playlist){
		return playlist
	}else{
		if( args.verbose){
			console.log( "have file")
		}
		return Promise.resolve([{
			file: entry
		}])
	}
}

function loadPlaylist(entry, ext, args){
	if( args.verbose){
		console.log( "loading playlist", entry)
	}
	return loadData( entry, args.verbose).then(function( file){
		return file.text()
	}).then(function( text){
		if( args.verbose){
			console.log("parsing playlist", entry)
		}
		var full= playlistParser[ ext.toUpperCase()].parse( text)
		if( args.verbose&& full.length> args.num){
			console.log( "limiting number of args")
			full= full.slice(0, args.num)
		}
		return full
	})
}

/**
 * Load a file or url
 */
function loadData( entry, verbose){
	return promisify( fs.stat)( path.dirname( entry)).then(function(){
		if( verbose >= 2){
			console.log( "loading file", entry)
		}
		return promisify( fs.readFile)(entry, 'utf8').then(function( file){
			return {
				text: function(){
					return file
				}
			}
		})
	}, function(){
		if( verbose >= 2){
			console.log( "fetching url", entry)
		}
		return fetch( entry)
	})
}

/**
 * Enqueue entries
 */
function enqueue( entries, sendCommand, args){
	return Promise.all( entries.map(function(entry){
		var all= []
		if( args.playlist){
			if( args.verbose){
				console.log("adding", entry.file, "to playlist", args.playlist)
			}
			var playlistadd= sendCommand( "playlistadd", [ args.playlist, entry.file])
			all.push(playlistadd)
		}
		if( !args.playlist|| args.start){
			if( args.verbose){
				console.log("adding", entry.file, "to current playlist")
			}
			var id= sendCommand( "addid", [ entry.file]).then(mpd.parseKeyValueMessage)
			all.push(id)
		}
		return Promise.all(all)
	}))
}

function play( queued, sendCommand, verbose){
	var last= queued[ queued.length- 1]
	last= last[last.length -1]
	var lastId= Number.parseInt(last.Id)
	sendCommand("playid", [lastId])
}

function client( args){
	var client= mpd.connect({
		host: args.host,
		port: args.port,
	})
	var d= defer()
	client.on( "ready", function(){
		d.resolve( client)
	})
	return d.promise
}

function uncaught(){
	process.on( "unhandledRejection", function( err){
		console.error( err)
	})
}

function main(){
	uncaught()

	// marshal args
	var args = getArgs()
	var entries= args._.slice( 2)
	if( args.verbose){
		console.log( "evaluating arguments")
		console.log( entries.join("\n"))
	}

	// load all arguments & flatten
	var loaded= entries.map(function( entry){
		return load(entry, args)
	})
	var flat= Promise.all( loaded).then(function( entries){
		return Array.prototype.concat.apply( [], entries)
	})

	// start making connection once we have the flat list
	var conn= flat.then(function(){
		return client( args)
	})
	// prepare a disconnect for client
	var disconnect= function(){
		conn.then(function( conn){
			if( args.verbose){
				console.log( "disconnect")
			}
			conn.socket.end()
		})
	}
	// prepare a send
	var sendCommand= function( msg, params){
		return conn.then(function( client){
			return promisify( client.sendCommand, client)( mpd.cmd( msg, params))
		})
	}

	return flat.then(function( flat){
		// queue
		return enqueue( flat, sendCommand, args)
	}).then(function( queued){
		// play
		if( args.start){
			if( args.verbose){
				console.log("playing")
			}
			play( queued, sendCommand)
		}
	}).then( disconnect, function(err){
		disconnect()
		throw err
	})
}

if(require.main === module){
	main()
}
