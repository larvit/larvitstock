'use strict';

const	//uuidValidate	= require('uuid-validate'),
	Intercom	= require('larvitamintercom'),
	stockLib	= require(__dirname + '/../index.js'),
	uuidLib	= require('uuid'),
	assert	= require('assert'),
	lUtils	= require('larvitutils'),
	async	= require('async'),
	log	= require('winston'),
	db	= require('larvitdb'),
	fs	= require('fs');

stockLib.dataWriter.mode = 'master';

// Set up winston
log.remove(log.transports.Console);
/**/log.add(log.transports.Console, {
	'level':	'warn',
	'colorize':	true,
	'timestamp':	true,
	'json':	false
});/**/


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

describe('Warehouse', function () {
	let	warehouseOptions = {
		uuid: uuidLib.v1(),
		name: 'Cellar'
	};

	it('should create a and save a warehouse', function (done) {
		const	tasks	= [],
			warehouse	= new stockLib.Warehouse(warehouseOptions);

		// Save warehouse
		tasks.push(function (cb) {
			warehouse.save(function (err) {
				if (err) throw err;
				cb(err);
			});
		});

		// Check the saved data.
		tasks.push(function (cb) {
			const warehouse	= new stockLib.Warehouse(warehouseOptions.uuid);
			warehouse.loadFromDb(function (err) {
				if (err) throw err;

				assert.deepEqual(warehouseOptions.uuid, warehouse.uuid);
				assert.deepEqual(warehouseOptions.name, warehouse.name);
				assert.notDeepEqual(undefined, warehouse.created);
				cb(err);
			});
		});

		async.series(tasks, function(err) {
			if (err) throw err;

			done();
		});
	});

	it('should remove privous created warehouse', function (done) {
		const	tasks	= [];

		// Remove warehouse
		tasks.push(function (cb) {
			const warehouse	= new stockLib.Warehouse(warehouseOptions.uuid);

			warehouse.rm(function (err) {
				if (err) throw err;

				cb(err);
			});
		});

		tasks.push(function (cb) {
			const warehouse	= new stockLib.Warehouse(warehouseOptions.uuid);

			warehouse.loadFromDb(function (err) {
				if (err) throw err;

				assert.deepEqual(warehouseOptions.uuid, warehouse.uuid);
				assert.deepEqual(undefined, warehouse.name);
				assert.deepEqual(undefined, warehouse.created);
				cb(err);
			});
		});

		async.series(tasks, function(err) {
			if (err) throw err;

			done();
		});
	});

	it('should create and get several warehouses', function (done) {
		const	tasks	= [];

		let	warehouseOptions1,
			warehouseOptions2,
			warehouseOptions3;


		warehouseOptions1 = {
			uuid: uuidLib.v1(),
			name: 'Cellar'
		};

		warehouseOptions2 = {
			uuid: uuidLib.v1(),
			name: 'Attic'
		};

		warehouseOptions3 = {
			uuid: uuidLib.v1(),
			name: 'Garage'
		};

		// Save warehouse1
		tasks.push(function (cb) {
			const warehouse = new stockLib.Warehouse(warehouseOptions1);

			warehouse.save(function (err) {
				if (err) throw err;

				cb(err);
			});
		});

		// Save warehouse2
		tasks.push(function (cb) {
			const warehouse = new stockLib.Warehouse(warehouseOptions2);

			warehouse.save(function (err) {
				if (err) throw err;

				cb(err);
			});
		});

		// Save warehouse3
		tasks.push(function (cb) {
			const warehouse = new stockLib.Warehouse(warehouseOptions3);

			warehouse.save(function (err) {
				if (err) throw err;

				cb(err);
			});
		});

		// Get all 3 warehouses
		tasks.push(function (cb) {
			const warehouses = new stockLib.Warehouses();

			warehouses.uuids	= [warehouseOptions1.uuid, warehouseOptions2.uuid, warehouseOptions3.uuid];

			warehouses.get(function (err, result) {
				if (err) throw err;

				assert.deepEqual(result[warehouseOptions1.uuid].uuid,	warehouseOptions1.uuid);
				assert.deepEqual(result[warehouseOptions1.uuid].name,	warehouseOptions1.name);
				assert.notDeepEqual(result[warehouseOptions1.uuid].created,	undefined);

				assert.deepEqual(result[warehouseOptions2.uuid].uuid,	warehouseOptions2.uuid);
				assert.deepEqual(result[warehouseOptions2.uuid].name,	warehouseOptions2.name);
				assert.notDeepEqual(result[warehouseOptions2.uuid].created,	undefined);

				assert.deepEqual(result[warehouseOptions3.uuid].uuid,	warehouseOptions3.uuid);
				assert.deepEqual(result[warehouseOptions3.uuid].name,	warehouseOptions3.name);
				assert.notDeepEqual(result[warehouseOptions3.uuid].created,	undefined);

				cb(err);
			});
		});

		async.series(tasks, function(err) {
			if (err) throw err;

			done();
		});
	});
});

describe('Slot', function () {
	let	testWarehouse,
		slotOptions = {
			uuid: uuidLib.v1(),
			name: 'A001'
		};

	before(function(done){
		const warehouses = new stockLib.Warehouses();

		warehouses.get(function (err, result) {
			if (err) throw err;

			testWarehouse	= result[Object.keys(result)[0]];
			slotOptions.warehouseUuid	= testWarehouse.uuid;
			done();
		});
	});

	it('should create a and save a slot', function (done) {
		const	tasks	= [],
			slot	= new stockLib.Slot(slotOptions);

		// Save slot
		tasks.push(function (cb) {
			slot.save(function (err) {
				if (err) throw err;

				cb(err);
			});
		});

		tasks.push(function (cb) {
			const slot	= new stockLib.Slot(slotOptions.uuid);

			slot.loadFromDb(function (err) {
				if (err) throw err;

				assert.deepEqual(slotOptions.uuid, slot.uuid);
				assert.deepEqual(slotOptions.name, slot.name);
				assert.deepEqual(slotOptions.warehouseUuid, slot.warehouseUuid);
				assert.notDeepEqual(slot.created, undefined);
				cb(err);
			});
		});

		async.series(tasks, function(err) {
			if (err) throw err;

			done();
		});
	});

	it('should remove privous created slot', function (done) {
		const	tasks	= [];

		// Remove slot
		tasks.push(function (cb) {
			const slot	= new stockLib.Slot(slotOptions.uuid);

			slot.rm(function (err) {
				if (err) throw err;

				cb(err);
			});
		});

		tasks.push(function (cb) {
			const slot	= new stockLib.Slot(slotOptions.uuid);

			slot.loadFromDb(function (err) {
				if (err) throw err;

				assert.deepEqual(slotOptions.uuid, slot.uuid);
				assert.deepEqual(undefined, slot.name);
				assert.deepEqual(undefined, slot.warehouseUuid);
				assert.deepEqual(undefined, slot.created);
				cb(err);
			});
		});

		async.series(tasks, function(err) {
			if (err) throw err;

			done();
		});
	});

	it('should create and get several slots', function (done) {
		const	tasks	= [];

		let	slotOptions1,
			slotOptions2,
			slotOptions3;


		slotOptions1 = {
			uuid: uuidLib.v1(),
			name: 'A001',
			warehouseUuid: testWarehouse.uuid
		};

		slotOptions2 = {
			uuid: uuidLib.v1(),
			name: 'A002',
			warehouseUuid: testWarehouse.uuid
		};

		slotOptions3 = {
			uuid: uuidLib.v1(),
			name: 'A003',
			warehouseUuid: testWarehouse.uuid
		};

		// Save slot1
		tasks.push(function (cb) {
			const slot = new stockLib.Slot(slotOptions1);

			slot.save(function (err) {
				if (err) throw err;

				cb(err);
			});
		});

		// Save slot2
		tasks.push(function (cb) {
			const slot = new stockLib.Slot(slotOptions2);

			slot.save(function (err) {
				if (err) throw err;

				cb(err);
			});
		});

		// Save slot3
		tasks.push(function (cb) {
			const slot = new stockLib.Slot(slotOptions3);

			slot.save(function (err) {
				if (err) throw err;

				cb(err);
			});
		});

		// Get all 3 slots
		tasks.push(function (cb) {
			const slots = new stockLib.Slots();

			slots.uuids	= [slotOptions1.uuid, slotOptions2.uuid, slotOptions3.uuid];

			slots.get(function (err, result) {
				if (err) throw err;

				assert.deepEqual(result[slotOptions1.uuid].uuid,	slotOptions1.uuid);
				assert.deepEqual(result[slotOptions1.uuid].name,	slotOptions1.name);
				assert.deepEqual(result[slotOptions1.uuid].warehouseUuid,	slotOptions1.warehouseUuid);
				assert.notDeepEqual(result[slotOptions1.uuid].created,	undefined);

				assert.deepEqual(result[slotOptions2.uuid].uuid,	slotOptions2.uuid);
				assert.deepEqual(result[slotOptions2.uuid].name,	slotOptions2.name);
				assert.deepEqual(result[slotOptions2.uuid].warehouseUuid,	slotOptions2.warehouseUuid);
				assert.notDeepEqual(result[slotOptions2.uuid].created,	undefined);

				assert.deepEqual(result[slotOptions3.uuid].uuid,	slotOptions3.uuid);
				assert.deepEqual(result[slotOptions3.uuid].name,	slotOptions3.name);
				assert.deepEqual(result[slotOptions3.uuid].warehouseUuid,	slotOptions3.warehouseUuid);
				assert.notDeepEqual(result[slotOptions3.uuid].created,	undefined);

				cb(err);
			});
		});

		async.series(tasks, function(err) {
			if (err) throw err;

			done();
		});
	});
});

after(function (done) {
	db.removeAllTables(done);
});
