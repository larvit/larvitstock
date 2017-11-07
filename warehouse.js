'use strict';

const	EventEmitter	= require('events').EventEmitter,
	eventEmitter	= new EventEmitter(),
	topLogPrefix	= 'larvitstock: Warehouse.js: ',
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

function Warehouse(options) {
	return this.init(options);
};

Warehouse.prototype.init = function (options) {
	const	logPrefix	= topLogPrefix + 'Warehouse.prototype.init() - ';

	if (options === undefined) {
		options = {};
	}

	// If options is a string, assume it is an uuid
	if (typeof options === 'string') {
		options = {'uuid': options};
	}

	if (options.uuid === undefined) {
		options.uuid	= uuidLib.v1();
		log.verbose(logPrefix + 'New Warehouse - Creating Warehouse with uuid: ' + options.uuid);
	} else {
		log.verbose(logPrefix + 'Instanciating warehouse with uuid: ' + options.uuid);
	}

	this.uuid	= options.uuid;

	if (options.name 	!== undefined)	this.name	= options.name;
	if (options.created 	!== undefined) 	this.created	= options.created;


	this.ready	= ready; // To expose to the outside world
};

Warehouse.prototype.loadFromDb = function (cb) {
	const	logPrefix	= topLogPrefix + 'Warehouse.prototype.loadFromDb() - uuid: "' + this.uuid + '" - ',
		tasks	= [],
		that	= this;

	// Await database readiness
	tasks.push(ready);

	// Load Warehouse from database
	tasks.push(function (cb) {
		log.debug(logPrefix + 'Getting warehouse data');
		db.query('SELECT * FROM warehouses WHERE uuid = ?', [lUtils.uuidToBuffer(that.uuid)], function (err, rows) {
			if (err) return cb(err);

			if (rows.length) {
				that.uuid	= lUtils.formatUuid(rows[0].uuid);
				that.name	= rows[0].name;
				that.created	= rows[0].created;
			}

			cb();
		});
	});

	async.series(tasks, cb);
};

Warehouse.prototype.save = function (cb) {
	const	tasks	= [],
		that	= this;

	if (that.created 	=== undefined) 	this.created	= new Date();
	if (that.name 	=== undefined || typeof that.name !== 'string')	throw new Error('Invalid warehouse name');
	if ( ! (this.created instanceof Date))		throw new Error('created is not an instance of Date');

	// Await database readiness
	tasks.push(ready);

	tasks.push(function (cb) {
		const	options	= {'exchange': dataWriter.exchangeName},
			message	= {};

		message.action	= 'writeWarehouse';
		message.params	= {};

		message.params.uuid	= that.uuid;
		message.params.warehouseUuid	= that.warehouseUuid;
		message.params.name	= that.name;
		message.params.created	= that.created;

		intercom.send(message, options, function (err, msgUuid) {
			if (err) return cb(err);

			dataWriter.emitter.once(msgUuid, cb);
		});
	});

	tasks.push(function (cb) {
		that.loadFromDb(cb);
	});

	async.series(tasks, cb);
};

Warehouse.prototype.rm = function (cb) {
	const	that	= this,
		options	= {'exchange': dataWriter.exchangeName},
		message	= {};

	message.action	= 'rmWarehouse';
	message.params	= {};
	message.params.uuid	= that.uuid;

	intercom.send(message, options, function (err, msgUuid) {
		if (err) return cb(err);

		dataWriter.emitter.once(msgUuid, cb);
	});

};
exports = module.exports = Warehouse;
