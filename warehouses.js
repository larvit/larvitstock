'use strict';

const	EventEmitter	= require('events').EventEmitter,
	eventEmitter	= new EventEmitter(),
	lUtils	= require('larvitutils'),
	async	= require('async'),
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

	async.series(tasks, function () {
		isReady	= true;
		eventEmitter.emit('ready');
		cb();
	});
}

function Warehouses() {
	this.ready	= ready;
}

/**
 * Get Warehouses
 *
 * @param func cb(err, warehouses, totalHits) - warehouses being an array and totalHits being a number
 */
Warehouses.prototype.get = function (cb) {
	const	tasks	= [],
		that	= this;

	let	warehouses	= {},
		hits;

	// Make sure database is ready
	tasks.push(ready);

	// Get basic warehouses
	tasks.push(function (cb) {
		const dbFields = [];

		let	sql	= ' FROM warehouses WHERE 1',
			hitsSql	= '';

		if (that.uuids !== undefined) {
			if ( ! (that.uuids instanceof Array)) {
				that.uuids = [that.uuids];
			}

			if (that.uuids.length === 0) {
				sql += '	AND 0';
			} else {
				sql += '	AND uuid IN (';

				for (let i = 0; that.uuids[i] !== undefined; i ++) {
					sql += '?,';
					dbFields.push(lUtils.uuidToBuffer(that.uuids[i]));
				}

				sql = sql.substring(0, sql.length - 1) + ')';
			}
		}

		sql += '	ORDER BY created DESC';

		hitsSql	= 'SELECT COUNT(*) AS hits' + sql;
		sql	= 'SELECT *' + sql;

		if (that.limit) {
			sql += ' LIMIT ' + parseInt(that.limit);
			if (that.offset) {
				sql += ' OFFSET ' + parseInt(that.offset);
			}
		}

		ready(function () {
			const	tasks	= [];

			tasks.push(function (cb) {
				db.query(sql, dbFields, function (err, rows) {
					if (err) return cb(err);

					for (let i = 0; rows[i] !== undefined; i ++) {
						rows[i].uuid	= lUtils.formatUuid(rows[i].uuid);
						warehouses[rows[i].uuid]	= {};
						warehouses[rows[i].uuid].uuid	= rows[i].uuid;
						warehouses[rows[i].uuid].name	= rows[i].name;
						warehouses[rows[i].uuid].created	= rows[i].created;
					}

					cb();
				});
			});

			tasks.push(function (cb) {
				db.query(hitsSql, dbFields, function (err, rows) {
					if (err) return cb(err);

					hits	= rows[0].hits;

					cb();
				});
			});

			async.parallel(tasks, cb);
		});
	});


	async.series(tasks, function (err) {
		if (err) return cb(err);

		cb(null, warehouses, hits);
	});

};

exports = module.exports = Warehouses;
