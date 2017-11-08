'use strict';

const	EventEmitter	= require('events').EventEmitter,
	eventEmitter	= new EventEmitter(),
	uuidValidate	=	require('uuid-validate'),
	topLogPrefix	= 'larvitstock: Slots.js: ',
	dataWriter	= require(__dirname + '/dataWriter.js'),
	uuidLib	= require('uuid'),
	lUtils	= require('larvitutils'),
	async	= require('async'),
	log	= require('winston'),
	db	= require('larvitdb');

let	readyInProgress	= false,
	isReady	= false;

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

	async.series(tasks, function () {
		isReady	= true;
		eventEmitter.emit('ready');
		cb();
	});
}

function Slot(options) {
	return this.init(options);
};

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

	if (options.warehouseUuid	!== undefined)	this.warehouseUuid	= options.warehouseUuid;
	if (options.name 	!== undefined)	this.name	= options.name;
	if (options.created 	!== undefined) 	this.created	= options.created;


	this.ready	= ready; // To expose to the outside world
};

Slot.prototype.loadFromDb = function (cb) {
	const	logPrefix	= topLogPrefix + 'Slot.prototype.loadFromDb() - uuid: "' + this.uuid + '" - ',
		tasks	= [],
		that	= this;

	// Await database readiness
	tasks.push(ready);

	// Load slot from database
	tasks.push(function (cb) {
		log.debug(logPrefix + 'Getting slot data');
		db.query('SELECT * FROM slots WHERE uuid = ?', [lUtils.uuidToBuffer(that.uuid)], function (err, rows) {
			if (err) return cb(err);

			if (rows.length) {
				that.uuid	= lUtils.formatUuid(rows[0].uuid);
				that.name	= rows[0].name;
				that.created	= rows[0].created;
				that.warehouseUuid	= lUtils.formatUuid(rows[0].warehouseUuid);
			}

			cb();
		});
	});

	async.series(tasks, cb);
};

Slot.prototype.save = function (cb) {
	const	tasks	= [],
		that	= this;

	if (that.created 	=== undefined) 	this.created	= new Date();
	if (that.warehouseUuid	=== undefined || ! uuidValidate(that.warehouseUuid))	throw new Error('Invalid warehouse uuid');
	if (that.name 	=== undefined || typeof that.name !== 'string')	throw new Error('Invalid slot name');
	if ( ! (this.created instanceof Date))		throw new Error('created is not an instance of Date');

	// Await database readiness
	tasks.push(ready);

	tasks.push(function (cb) {
		const	options	= {'exchange': dataWriter.exchangeName},
			message	= {};

		message.action	= 'writeSlot';
		message.params	= {};

		message.params.uuid	= that.uuid;
		message.params.warehouseUuid	= that.warehouseUuid;
		message.params.name	= that.name;
		message.params.created	= that.created;

		dataWriter.intercom.send(message, options, function (err, msgUuid) {
			if (err) return cb(err);

			dataWriter.emitter.once(msgUuid, cb);
		});
	});

	tasks.push(function (cb) {
		that.loadFromDb(cb);
	});

	async.series(tasks, cb);
};

Slot.prototype.rm = function (cb) {
	const	that	= this,
		options	= {'exchange': dataWriter.exchangeName},
		message	= {};

	message.action	= 'rmSlot';
	message.params	= {};
	message.params.uuid	= that.uuid;

	dataWriter.intercom.send(message, options, function (err, msgUuid) {
		if (err) return cb(err);

		dataWriter.emitter.once(msgUuid, cb);
	});

};
exports = module.exports = Slot;
