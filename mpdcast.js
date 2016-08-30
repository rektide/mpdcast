#!/usr/bin/env node
"use strict"

var
  fetch= require( "node-fetch"),
  fs= require("fs"),
  mpd= require( "mpd"),
  path= require("path"),
  playlistParser= require("playlist-parser"),
  promisify= require("es6-promisify"),
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
		.option( "max", {
			alias: "m",
			describe: "limit maximum number of entries to enqueue",
			group: "mpdcast",
			number: true,
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
function load(entry, verbose){
	var ext= path.extname( entry).toLowerCase()
	var q= ext.indexOf( "?")
	if( q){
		ext= ext.substring(1, q)
	}
	var playlist
	if( ext == "pls"){
		playlist= loadPlaylist(entry, ext, verbose)
	}else if( ext == "m3u"){
		playlist= loadPlaylist(entry, ext, verbose)
	}else if(ext == "asx"){
		playlist= loadPlaylist(entry, ext, verbose)
	}else{
		if( verbose){
			console.log( "have file")
		}
		return Promise.resolve([{
			file: entry
		}])
	}
	return playlist
}

function loadPlaylist(entry, ext, verbose){
	if( verbose){
		console.log( "loading playlist", entry)
	}
	return loadData( entry, verbose).then(function( file){
		return file.text()
	}).then(function( text){
		if( verbose){
			console.log("parsing playlist", entry)
		}
		return playlistParser[ ext.toUpperCase()].parse( text)
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
function enqueue( entries, client, args){
	return Promise.all( entries.map(function(){
		
	}))
}

function client( args){
	var client= mpd.connect({
		host: args.host,
		port: args.port,
	})
	var defer= Promise.defer()
	client.on( "ready", function(){
		defer.resolve( client)
	})
	return defer.promise
}

function uncaught(){
	process.on( "unhandledRejection", function( err){
		console.error( err)
	})
}

function main(){
	uncaught()
	var args = getArgs()
	var entries= args._.slice( 2)
	if( args.verbose){
		console.log( "evaluating arguments")
		console.log( entries.join("\n"))
	}
	var loaded= entries.map(function( entry){
		return load(entry, args.verbose)
	})
	return Promise.all( loaded).then(function( entries){
		var flat = Array.prototype.concat.apply( [], entries)
		return client( args).then(function( client){
			return enqueue( flat, client, args)
		})
	})
}

if(require.main === module){
	main()
}
