'use strict';

const	EventEmitter	= require('events').EventEmitter,
	eventEmitter	= new EventEmitter(),
	topLogPrefix	= 'larvitstock: Slots.js: ',
	dataWriter	= require(__dirname + '/dataWriter.js'),
	uuidLib	= require('uuid'),
	lUtils	= require('larvitutils'),
	async	= require('async'),
	log	= require('winston'),
	db	= require('larvitdb');

let	readyInProgress	= false,
	isReady	= false,
	intercom;

function ready(cb) {
	const	tasks	= [];

	if (isReady === true) return cb();

	if (readyInProgress === true) {
		eventEmitter.on('ready', cb);
		return;
	}

	readyInProgress = true;

	tasks.push(function (cb) {
		dataWriter.ready(cb);
	});

	// Load intercom. This must be done after the datawriter is ready
	tasks.push(function (cb) {
		intercom	= require('larvitutils').instances.intercom;
		cb();
	});

	async.series(tasks, function () {
		isReady	= true;
		eventEmitter.emit('ready');
		cb();
	});
}

function Slot(options) {
	return this.init(options);
}

Slot.prototype.init = function (options) {
	const	logPrefix	= topLogPrefix + 'Slot.prototype.init() - ';

	if (options === undefined) {
		options = {};
	}

	// If options is a string, assume it is an uuid
	if (typeof options === 'string') {
		options = {'uuid': options};
	}

	if (options.uuid === undefined) {
		options.uuid	= uuidLib.v1();
		log.verbose(logPrefix + 'New Slot - Creating Slot with uuid: ' + options.uuid);
	} else {
		log.verbose(logPrefix + 'Instanciating slot with uuid: ' + options.uuid);
	}

	this.uuid	= options.uuid;

	if (options.created !== undefined) {
		this.created	= options.created;
	} else {
		this.created	= new Date();
	}

	if ( ! (this.created instanceof Date)) {
		throw new Error('created is not an instance of Date');
	}

	this.fields	= options.fields;
	this.ready	= ready; // To expose to the outside world

	if (this.fields === undefined) {
		this.fields = {};
	}
};
