'use strict';

const	EventEmitter	= require('events').EventEmitter,
	eventEmitter	= new EventEmitter(),
	topLogPrefix	= 'larvitstock: dataWriter.js: ',
	DbMigration	= require('larvitdbmigration'),
	lUtils	= require('larvitutils'),
	amsync	= require('larvitamsync'),
	async	= require('async'),
	log	= require('winston'),
	db	= require('larvitdb');

let	readyInProgress	= false,
	isReady	= false,
	intercom;

function listenToQueue(retries, cb) {
	const	logPrefix	= topLogPrefix + 'listenToQueue() - ',
		options	= {'exchange': exports.exchangeName};

	let	listenMethod;

	if (typeof retries === 'function') {
		cb	= retries;
		retries	= 0;
	}

	if (typeof cb !== 'function') {
		cb = function (){};
	}

	if (retries === undefined) {
		retries = 0;
	}

	if (exports.mode === 'master') {
		listenMethod	= 'consume';
		options.exclusive	= true;	// It is important no other client tries to sneak
				// out messages from us, and we want "consume"
				// since we want the queue to persist even if this
				// minion goes offline.
	} else if (exports.mode === 'slave' || exports.mode === 'noSync') {
		listenMethod = 'subscribe';
	} else {
		const	err	= new Error('Invalid exports.mode. Must be either "master", "slave" or "noSync"');
		log.error(logPrefix + err.message);
		return cb(err);
	}

	intercom	= require('larvitutils').instances.intercom;

	if ( ! (intercom instanceof require('larvitamintercom')) && retries < 10) {
		retries ++;
		setTimeout(function () {
			listenToQueue(retries, cb);
		}, 50);
		return;
	} else if ( ! (intercom instanceof require('larvitamintercom'))) {
		log.error(logPrefix + 'Intercom is not set!');
		return;
	}

	log.info(logPrefix + 'listenMethod: ' + listenMethod);

	intercom.ready(function (err) {
		if (err) {
			log.error(logPrefix + 'intercom.ready() err: ' + err.message);
			return;
		}

		intercom[listenMethod](options, function (message, ack, deliveryTag) {
			exports.ready(function (err) {
				ack(err); // Ack first, if something goes wrong we log it and handle it manually

				if (err) {
					log.error(logPrefix + 'intercom.' + listenMethod + '() - exports.ready() returned err: ' + err.message);
					return;
				}

				if (typeof message !== 'object') {
					log.error(logPrefix + 'intercom.' + listenMethod + '() - Invalid message received, is not an object! deliveryTag: "' + deliveryTag + '"');
					return;
				}

				if (typeof exports[message.action] === 'function') {
					exports[message.action](message.params, deliveryTag, message.uuid);
				} else {
					log.warn(logPrefix + 'intercom.' + listenMethod + '() - Unknown message.action received: "' + message.action + '"');
				}
			});
		}, ready);
	});
}
// Run listenToQueue as soon as all I/O is done, this makes sure the exports.mode can be set
// by the application before listening commences
setImmediate(listenToQueue);

// This is ran before each incoming message on the queue is handeled
function ready(retries, cb) {
	const	logPrefix	= topLogPrefix + 'ready() - ',
		tasks	= [];

	if (typeof retries === 'function') {
		cb	= retries;
		retries	= 0;
	}

	if (typeof cb !== 'function') {
		cb = function (){};
	}

	if (retries === undefined) {
		retries	= 0;
	}

	if (isReady === true) { cb(); return; }

	if (readyInProgress === true) {
		eventEmitter.on('ready', cb);
		return;
	}

	intercom	= require('larvitutils').instances.intercom;

	if ( ! (intercom instanceof require('larvitamintercom')) && retries < 10) {
		retries ++;
		setTimeout(function () {
			ready(retries, cb);
		}, 50);
		return;
	} else if ( ! (intercom instanceof require('larvitamintercom'))) {
		log.error(logPrefix + 'Intercom is not set!');
		return;
	}

	readyInProgress = true;

	if (exports.mode === 'both' || exports.mode === 'slave') {
		log.verbose(logPrefix + 'exports.mode: "' + exports.mode + '", so read');

		tasks.push(function (cb) {
			amsync.mariadb({'exchange': exports.exchangeName + '_dataDump'}, cb);
		});
	}

	// Migrate database
	tasks.push(function (cb) {
		const	options	= {};

		let	dbMigration;

		options.dbType	= 'larvitdb';
		options.dbDriver	= db;
		options.tableName	= 'orders_db_version';
		options.migrationScriptsPath	= __dirname + '/dbmigration';
		dbMigration	= new DbMigration(options);

		dbMigration.run(function (err) {
			if (err) {
				log.error(logPrefix + 'Database error: ' + err.message);
			}

			cb(err);
		});
	});

	async.series(tasks, function (err) {
		if (err) return;

		isReady	= true;
		eventEmitter.emit('ready');

		if (exports.mode === 'both' || exports.mode === 'master') {
			runDumpServer(cb);
		} else {
			cb();
		}
	});
}

function runDumpServer(cb) {
	cb(null);
}

function writeWarehouse(params, deliveryTag, msgUuid, cb) {
	const	logPrefix	= topLogPrefix + 'writeWarehouse() - ',
		warehouseUuid	= params.uuid,
		warehouseUuidBuf	= lUtils.uuidToBuffer(warehouseUuid),
		created	= params.created,
		tasks	= [],
		name	=	params.name;

	let	dbCon;

	if (typeof cb !== 'function') {
		cb = function () {};
	}

	if (lUtils.formatUuid(warehouseUuid) === false || warehouseUuidBuf === false) {
		const err = new Error('Invalid warehouseUuid: "' + warehouseUuid + '"');
		log.error(logPrefix + err.message);
		exports.emitter.emit(warehouseUuid, err);
		return;
	}

	// Get a database connection
	tasks.push(function (cb) {
		db.getConnection(function(err, result) {
			dbCon	= result;
			cb(err);
		});
	});

	// Write warehouse
	tasks.push(function (cb) {
		const	sql	= 'INSERT IGNORE INTO warehouses (uuid, name, created) VALUES(?,?,?)';

		dbCon.query(sql, [warehouseUuidBuf, name, created], cb);
	});


	async.series(tasks, function (err) {
		if (dbCon) {
			if (err) {
				return dbCon.rollback(function (rollErr) {
					if (rollErr) {
						log.error(logPrefix + 'Could not rollback: ' + rollErr.message);
					}
					exports.emitter.emit(msgUuid, err);
					return cb(err);
				});
			}

			dbCon.commit(function (err) {
				if (err) {
					return dbCon.rollback(function (rollErr) {
						if (rollErr) {
							log.error(logPrefix + 'Could not rollback: ' + rollErr.message);
						}
						exports.emitter.emit(msgUuid, err);
						return cb(err);
					});
				}

				exports.emitter.emit(msgUuid, null);
				return cb();
			});

			return;
		}

		exports.emitter.emit(msgUuid, err);
		return cb(err);
	});
}

function rmWarehouse(params, deliveryTag, msgUuid) {
	const	warehouseUuid	= params.uuid,
		warehouseUuidBuf	= lUtils.uuidToBuffer(warehouseUuid),
		tasks	= [];


	// Delete warehouse
	tasks.push(function (cb) {
		const	dbFields	= [warehouseUuidBuf],
			sql	= 'DELETE FROM warehouses WHERE uuid = ?';

		db.query(sql, dbFields, cb);
	});

	async.series(tasks, function (err) {
		exports.emitter.emit(msgUuid, err);
	});
}

function writeSlot(params, deliveryTag, msgUuid, cb) {
	const	warehouseUuid	= params.warehouseUuid,
		warehouseUuidBuf	= lUtils.uuidToBuffer(warehouseUuid),
		logPrefix	= topLogPrefix + 'writeSlot() - ',
		slotUuid	= params.uuid,
		slotUuidBuf	= lUtils.uuidToBuffer(slotUuid),
		created	= params.created,
		tasks	= [],
		name	=	params.name;

	let	dbCon;

	if (typeof cb !== 'function') {
		cb = function () {};
	}

	if (lUtils.formatUuid(slotUuid) === false || slotUuidBuf === false) {
		const err = new Error('Invalid slotrUuid: "' + slotUuid + '"');
		log.error(logPrefix + err.message);
		exports.emitter.emit(slotUuid, err);
		return;
	}

	if (lUtils.formatUuid(warehouseUuid) === false || warehouseUuidBuf === false) {
		const err = new Error('Invalid slotrUuid: "' + warehouseUuid + '"');
		log.error(logPrefix + err.message);
		exports.emitter.emit(warehouseUuid, err);
		return;
	}

	// Get a database connection
	tasks.push(function (cb) {
		db.getConnection(function(err, result) {
			dbCon	= result;
			cb(err);
		});
	});

	// Make sure the base order row exists
	tasks.push(function (cb) {
		const	sql	= 'INSERT IGNORE INTO slots (uuid, warehouseUuid, name, created) VALUES(?,?,?,?)';

		dbCon.query(sql, [slotUuidBuf, warehouseUuidBuf, name, created], cb);
	});


	async.series(tasks, function (err) {
		if (dbCon) {
			if (err) {
				return dbCon.rollback(function (rollErr) {
					if (rollErr) {
						log.error(logPrefix + 'Could not rollback: ' + rollErr.message);
					}
					exports.emitter.emit(msgUuid, err);
					return cb(err);
				});
			}

			dbCon.commit(function (err) {
				if (err) {
					return dbCon.rollback(function (rollErr) {
						if (rollErr) {
							log.error(logPrefix + 'Could not rollback: ' + rollErr.message);
						}
						exports.emitter.emit(msgUuid, err);
						return cb(err);
					});
				}

				exports.emitter.emit(msgUuid, null);
				return cb();
			});

			return;
		}

		exports.emitter.emit(msgUuid, err);
		return cb(err);
	});
}

function rmSlot(params, deliveryTag, msgUuid) {
	const	slotUuid	= params.uuid,
		slotUuidBuf	= lUtils.uuidToBuffer(slotUuid),
		tasks	= [];


	// Delete slot
	tasks.push(function (cb) {
		const	dbFields	= [slotUuidBuf],
			sql	= 'DELETE FROM slots WHERE uuid = ?';

		db.query(sql, dbFields, cb);
	});

	async.series(tasks, function (err) {
		exports.emitter.emit(msgUuid, err);
	});
}

function writeItem(params, deliveryTag, msgUuid, cb) {
	const	slotUuid	= params.slotUuid,
		slotUuidBuf	= lUtils.uuidToBuffer(slotUuid),
		logPrefix	= topLogPrefix + 'writeItem() - ',
		itemUuid	= params.uuid,
		itemUuidBuf	= lUtils.uuidToBuffer(itemUuid),
		created	= params.created,
		tasks	= [],
		article	=	params.article;

	let	dbCon;

	if (typeof cb !== 'function') {
		cb = function () {};
	}

	if (lUtils.formatUuid(itemUuid) === false || itemUuidBuf === false) {
		const err = new Error('Invalid itemUuid: "' + itemUuid + '"');
		log.error(logPrefix + err.message);
		exports.emitter.emit(itemUuid, err);
		return;
	}

	if (lUtils.formatUuid(slotUuid) === false || slotUuidBuf === false) {
		const err = new Error('Invalid itemUuid: "' + slotUuid + '"');
		log.error(logPrefix + err.message);
		exports.emitter.emit(slotUuid, err);
		return;
	}

	// Get a database connection
	tasks.push(function (cb) {
		db.getConnection(function(err, result) {
			dbCon	= result;
			cb(err);
		});
	});

	// Make sure the base order row exists
	tasks.push(function (cb) {
		const	sql	= 'INSERT IGNORE INTO items (uuid, article, slotUuid, created) VALUES(?,?,?,?)';

		dbCon.query(sql, [itemUuidBuf, article, slotUuidBuf, created], cb);
	});


	async.series(tasks, function (err) {
		if (dbCon) {
			if (err) {
				return dbCon.rollback(function (rollErr) {
					if (rollErr) {
						log.error(logPrefix + 'Could not rollback: ' + rollErr.message);
					}
					exports.emitter.emit(msgUuid, err);
					return cb(err);
				});
			}

			dbCon.commit(function (err) {
				if (err) {
					return dbCon.rollback(function (rollErr) {
						if (rollErr) {
							log.error(logPrefix + 'Could not rollback: ' + rollErr.message);
						}
						exports.emitter.emit(msgUuid, err);
						return cb(err);
					});
				}

				exports.emitter.emit(msgUuid, null);
				return cb();
			});

			return;
		}

		exports.emitter.emit(msgUuid, err);
		return cb(err);
	});
}

function rmItem(params, deliveryTag, msgUuid) {
	const	itemUuid	= params.uuid,
		itemUuidBuf	= lUtils.uuidToBuffer(itemUuid),
		tasks	= [];


	// Delete slot
	tasks.push(function (cb) {
		const	dbFields	= [itemUuidBuf],
			sql	= 'DELETE FROM items WHERE uuid = ?';

		db.query(sql, dbFields, cb);
	});

	async.series(tasks, function (err) {
		exports.emitter.emit(msgUuid, err);
	});
}

exports.emitter	= new EventEmitter();
exports.exchangeName	= 'larvitstock';
exports.ready	= ready;
exports.writeWarehouse	= writeWarehouse;
exports.rmWarehouse	= rmWarehouse;
exports.writeSlot	= writeSlot;
exports.rmSlot	= rmSlot;
exports.writeItem	= writeItem;
exports.rmItem	= rmItem;
