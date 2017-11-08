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

function Items() {
	this.ready	= ready;
}

/**
 * Get Items
 *
 * @param func cb(err, items, totalHits) - items being an array and totalHits being a number
 */
Items.prototype.get = function (cb) {
	const	tasks	= [],
		that	= this;

	let	items	= {},
		hits;

	// Make sure database is ready
	tasks.push(ready);

	// Get basic items
	tasks.push(function (cb) {
		const dbFields = [];

		let	sql	= ' FROM items WHERE 1',
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
						items[rows[i].uuid]	= {};
						items[rows[i].uuid].uuid	= rows[i].uuid;
						items[rows[i].uuid].article	= rows[i].article;
						items[rows[i].uuid].created	= rows[i].created;
						items[rows[i].uuid].slotUuid	= lUtils.formatUuid(rows[i].slotUuid);
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

		cb(null, items, hits);
	});

};

exports = module.exports = Items;
