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

//function rmOrder(params, deliveryTag, msgUuid) {
//	const	orderUuid	= params.uuid,
//		orderUuidBuf	= lUtils.uuidToBuffer(orderUuid),
//		tasks	= [];
//
//	// Delete field data
//	tasks.push(function (cb) {
//		db.query('DELETE FROM orders_orders_fields WHERE orderUuid = ?', [orderUuidBuf], cb);
//	});
//
//	// Delete row field data
//	tasks.push(function (cb) {
//		const	dbFields	= [orderUuidBuf],
//			sql	= 'DELETE FROM orders_rows_fields WHERE rowUuid IN (SELECT rowUuid FROM orders_rows WHERE orderUuid = ?)';
//
//		db.query(sql, dbFields, cb);
//	});
//
//	// Delete rows
//	tasks.push(function (cb) {
//		const	dbFields	= [orderUuidBuf],
//			sql	= 'DELETE FROM orders_rows WHERE orderUuid = ?';
//
//		db.query(sql, dbFields, cb);
//	});
//
//	// Delete order
//	tasks.push(function (cb) {
//		const	dbFields	= [orderUuidBuf],
//			sql	= 'DELETE FROM orders WHERE uuid = ?';
//
//		db.query(sql, dbFields, cb);
//	});
//
//	async.series(tasks, function (err) {
//		exports.emitter.emit(msgUuid, err);
//	});
//}

function runDumpServer(cb) {
	cb(null);
}

//function runDumpServer(cb) {
//	const	options	= {'exchange': exports.exchangeName + '_dataDump'},
//		args	= [];
//
//	if (db.conf.host) {
//		args.push('-h');
//		args.push(db.conf.host);
//	}
//
//	args.push('-u');
//	args.push(db.conf.user);
//
//	if (db.conf.password) {
//		args.push('-p' + db.conf.password);
//	}
//
//	args.push('--single-transaction');
//	args.push('--hex-blob');
//	args.push(db.conf.database);
//
//	// Tables
//	args.push('orders');
//	args.push('orders_db_version');
//	args.push('orders_orderFields');
//	args.push('orders_orders_fields');
//	args.push('orders_rowFields');
//	args.push('orders_rows');
//	args.push('orders_rows_fields');
//
//	options.dataDumpCmd = {
//		'command':	'mysqldump',
//		'args':	args
//	};
//
//	options['Content-Type'] = 'application/sql';
//
//	new amsync.SyncServer(options, cb);
//}

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

exports.emitter	= new EventEmitter();
exports.exchangeName	= 'larvitstock';
exports.ready	= ready;
//exports.rmOrder	= rmOrder;
exports.writeSlot	= writeSlot;
