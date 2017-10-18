'use strict';

const	//uuidValidate	= require('uuid-validate'),
	Intercom	= require('larvitamintercom'),
	stockLib	= require(__dirname + '/../index.js'),
	uuidLib	= require('uuid'),
	//assert	= require('assert'),
	lUtils	= require('larvitutils'),
	async	= require('async'),
	log	= require('winston'),
	db	= require('larvitdb'),
	fs	= require('fs');

stockLib.dataWriter.mode = 'master';

// Set up winston
//log.remove(log.transports.Console);
///**/log.add(log.transports.Console, {
//	'level':	'warn',
//	'colorize':	true,
//	'timestamp':	true,
//	'json':	false
//});/**/


before(function (done) {
	this.timeout(10000);
	const	tasks	= [];

	// Run DB Setup
	tasks.push(function (cb) {
		let confFile;

		if (process.env.DBCONFFILE === undefined) {
			confFile = __dirname + '/../config/db_test.json';
		} else {
			confFile = process.env.DBCONFFILE;
		}

		log.verbose('DB config file: "' + confFile + '"');

		// First look for absolute path
		fs.stat(confFile, function (err) {
			if (err) {

				// Then look for this string in the config folder
				confFile = __dirname + '/../config/' + confFile;
				fs.stat(confFile, function (err) {
					if (err) throw err;
					log.verbose('DB config: ' + JSON.stringify(require(confFile)));
					db.setup(require(confFile), cb);
				});

				return;
			}

			log.verbose('DB config: ' + JSON.stringify(require(confFile)));
			db.setup(require(confFile), cb);
		});
	});

	// Check for empty db
	tasks.push(function (cb) {
		db.query('SHOW TABLES', function (err, rows) {
			if (err) throw err;

			if (rows.length) {
				throw new Error('Database is not empty. To make a test, you must supply an empty database!');
			}

			cb();
		});
	});

	// Setup intercom
	tasks.push(function (cb) {
		lUtils.instances.intercom = new Intercom('loopback interface');
		lUtils.instances.intercom.on('ready', cb);
	});

	tasks.push(function (cb) {
		stockLib.dataWriter.ready(cb);
	});

	async.series(tasks, done);
});

describe('Slot', function () {
	let	slotOptions = {
		uuid: uuidLib.v1(),
		name: 'A001',
		warehouseUuid: uuidLib.v1()
	};

	it('should create a and save a slot', function (done) {
		const slot = new stockLib.Slot(slotOptions);
		console.log(slot);
		done();
	});
});


after(function (done) {
	db.removeAllTables(done);
});
