'use strict';

const	EventEmitter	= require('events').EventEmitter,
	eventEmitter	= new EventEmitter(),
	uuidValidate	=	require('uuid-validate'),
	topLogPrefix	= 'larvitstock: Item.js: ',
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

function Item(options) {
	return this.init(options);
};

Item.prototype.init = function (options) {
	const	logPrefix	= topLogPrefix + 'Item.prototype.init() - ';

	if (options === undefined) {
		options = {};
	}

	// If options is a string, assume it is an uuid
	if (typeof options === 'string') {
		options = {'uuid': options};
	}

	if (options.uuid === undefined) {
		options.uuid	= uuidLib.v1();
		log.verbose(logPrefix + 'New Item - Creating Item with uuid: ' + options.uuid);
	} else {
		log.verbose(logPrefix + 'Instanciating item with uuid: ' + options.uuid);
	}

	this.uuid	= options.uuid;

	if (options.slotUuid	!== undefined)	this.slotUuid	= options.slotUuid;
	if (options.article 	!== undefined)	this.article	= options.article;
	if (options.created 	!== undefined) 	this.created	= options.created;


	this.ready	= ready; // To expose to the outside world
};

Item.prototype.loadFromDb = function (cb) {
	const	logPrefix	= topLogPrefix + 'Item.prototype.loadFromDb() - uuid: "' + this.uuid + '" - ',
		tasks	= [],
		that	= this;

	// Await database readiness
	tasks.push(ready);

	// Load item from database
	tasks.push(function (cb) {
		log.debug(logPrefix + 'Getting item data');
		db.query('SELECT * FROM items WHERE uuid = ?', [lUtils.uuidToBuffer(that.uuid)], function (err, rows) {
			if (err) return cb(err);

			if (rows.length) {
				that.uuid	= lUtils.formatUuid(rows[0].uuid);
				that.article	= rows[0].article;
				that.created	= rows[0].created;
				that.slotUuid	= lUtils.formatUuid(rows[0].slotUuid);
			}

			cb();
		});
	});

	async.series(tasks, cb);
};

Item.prototype.save = function (cb) {
	const	tasks	= [],
		that	= this;

	if (that.created 	=== undefined) 	this.created	= new Date();
	if (that.slotUuid	=== undefined || ! uuidValidate(that.slotUuid))	throw new Error('Invalid slot uuid');
	if (that.article 	=== undefined || typeof that.article !== 'string')	throw new Error('Invalid item article');
	if ( ! (this.created instanceof Date))		throw new Error('Created is not an instance of Date');

	// Await database readiness
	tasks.push(ready);

	tasks.push(function (cb) {
		const	options	= {'exchange': dataWriter.exchangeName},
			message	= {};

		message.action	= 'writeItem';
		message.params	= {};

		message.params.uuid	= that.uuid;
		message.params.slotUuid	= that.slotUuid;
		message.params.article	= that.article;
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

Item.prototype.rm = function (cb) {
	const	that	= this,
		options	= {'exchange': dataWriter.exchangeName},
		message	= {};

	message.action	= 'rmItem';
	message.params	= {};
	message.params.uuid	= that.uuid;

	intercom.send(message, options, function (err, msgUuid) {
		if (err) return cb(err);

		dataWriter.emitter.once(msgUuid, cb);
	});
};

exports = module.exports = Item;
