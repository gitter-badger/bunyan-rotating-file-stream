'use strict';

var async = require('async');
var _ = require('lodash');
var EventEmitter = require('events').EventEmitter;

function LimitedQueue(worker) {
    var base = new EventEmitter();

    const maxQueueLength = 100000;
    const queueClearingThreshold = 0.8;
    var throwLogsAway = false;

    var joiners = []; // List of callbacks to call when we're empty

    var queue = async.cargo(function (s, callback) {

        var queueLowerThreshold = (maxQueueLength * queueClearingThreshold);
        if (throwLogsAway && queue.length() < queueLowerThreshold) {
            var notification = {
                'name':'rfs',
                'time':new Date(Date.now()).toISOString(),
                'event': 'desaturated',
                'message': 'Write queue clearing, allowing new log events',
                'v':0
            };


            var inplace = _.extend(
                {},
                {immediatelog: false},
                notification
            );
            queue.push(JSON.stringify(inplace) + '\n');

            var immediate = _.extend(
                {},
                {immediatelog: true},
                notification
            );
            queue.unshift(JSON.stringify(immediate) + '\n');

            console.log(notification.message);
            throwLogsAway = false;

            base.emit('caughtup');
        }

        worker(s, callback);
    }, 2000);

    function push(s) {
        if (!throwLogsAway) {
            if (queue.length() > maxQueueLength) {
                var notification = {
                    'name':'rfs',
                    'time':new Date(Date.now()).toISOString(),
                    'event': 'saturated',
                    'message': 'Write queue saturated, stopping logging',
                    'v':0
                };

                var inplace = _.extend(
                    {},
                    {immediatelog: false},
                    notification
                );
                queue.push(JSON.stringify(inplace) + '\n');

                var immediate = _.extend(
                    {},
                    {immediatelog: true},
                    notification
                );
                queue.unshift(JSON.stringify(immediate) + '\n');

                console.log(notification.message);
                throwLogsAway = true;

                base.emit('losingdata');
            } else {
                queue.push(s);
            }
        }
    }

    queue.drain = function () {
        if (throwLogsAway) {
            var notification = {
                'name':'rfs',
                'time':new Date(Date.now()).toISOString(),
                'event': 'desaturated',
                'message': 'Write queue cleared, allowing new log events',
                'v':0
            };

            var message = _.extend({}, {immediatelog: false}, notification);
            queue.push(JSON.stringify(message) + '\n');

            console.log(notification.message);
            throwLogsAway = false;

            base.emit('caughtup');
        }

        if (joiners.length > 0) {
            for (var i = 0; i < joiners.length; i += 1) {
                joiners[i]();
            }

            joiners = [];
        }
    }

    function paused() {
        return queue.paused;
    }

    function join(cb) {
        if (queue.length() === 0) {
            cb();
        } else {
            joiners.push(cb);
        }
    }

    return _.extend({}, {
        push,
        paused,
        pause: queue.pause,
        resume: queue.resume,
        unshift: queue.unshift,
        join
    }, base);
}

module.exports = LimitedQueue;
