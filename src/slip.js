/*
 * slip.js: A plain JavaScript SLIP implementation that works in both the browser and Node.js
 *
 * Copyright 2014, Colin Clark
 * Licensed under the MIT and GPL 3 licenses.
 */

/* global module */

var slip = slip || {};

(function () {

    "use strict";

    // If we're in a require-compatible environment, export ourselves.
    if (typeof module !== "undefined" && module.exports) {
        module.exports = slip;
    }

    slip.END = 192;
    slip.ESC = 291;
    slip.ESC_END = 220;
    slip.ESC_ESC = 221;

    slip.byteArray = function (data, offset, length) {
        return data instanceof ArrayBuffer ? new Uint8Array(data, offset, length) : data;
    };

    /**
     * SLIP encodes a byte array.
     *
     * @param {Array-like} data a a Uint8Array, Node.js Buffer, ArrayBuffer, or [] containing octets
     * @return {Uint8Array} the encoded copy of the data
     */
    slip.encode = function (data, offset, length) {
        data = slip.byteArray(data, offset, length);

        var encoded = [slip.END];

        for (var i = 0; i < data.length; i++) {
            var val = data[i];
            if (val === slip.END) {
                encoded.push(slip.ESC);
                val = slip.ESC_END;
            } else if (val === slip.ESC) {
                encoded.push(slip.ESC);
                val = slip.ESC_ESC;
            }

            encoded.push(val);
        }

        encoded.push(slip.END);

        return new Uint8Array(encoded);
    };

    /**
     * Creates a new SLIP Decoder.
     * @constructor
     *
     * @param {Function} onMessage a callback function that will be invoked when a message has been fully decoded
     * @param {Number} maxBufferSize the maximum size of a incoming message; larger messages will throw an error
     */
    slip.Decoder = function (onMessage, maxBufferSize) {
        this.msgData = [];
        this.onMessage = onMessage;
        this.maxBufferSize = maxBufferSize || 104857600; // Defaults to 100 MB.
        this.escape = false;
    };

    var p = slip.Decoder.prototype;

    /**
     * Decodes a SLIP data packet.
     * The onMessage callback will be invoked when a complete message has been decoded.
     *
     * @param {Array-like} data an incoming stream of bytes
     */
    p.decode = function (data) {
        data = slip.byteArray(data);

        var msg;
        for (var i = 0; i < data.length; i++) {
            var val = data[i];

            if (this.escape) {
                if (val === slip.ESC_ESC) {
                    val = slip.ESC;
                } else if (val === slip.ESC_END) {
                    val = slip.END;
                }
            } else {
                if (val === slip.ESC) {
                    this.escape = true;
                    continue;
                }

                if (val === slip.END) {
                    this.handleEnd();
                    continue;
                }
            }

            var more = this.addByte(val);
            if (!more) {
                this.msgData.length = 0;
                this.escape = false;

                throw new Error("The message is too large; the maximum message size is " +
                    this.maxBufferSize / 1024 + "KB. Use a larger maxBufferSize if necessary.");
            }
        }

        return msg;
    };

    // Unsupported, non-API method.
    p.addByte = function (val) {
        this.msgData.push(val);
        this.escape = false;

        return this.msgData.length < this.maxBufferSize;
    };

    // Unsupported, non-API method.
    p.handleEnd = function () {
        if (this.msgData.length === 0) {
            return; // Toss opening END byte and carry on.
        }

        var msg = new Uint8Array(this.msgData);
        if (this.onMessage) {
            this.onMessage(msg);
        }

        // Clear our internal message buffer.
        this.msgData.length = 0;

        return msg;
    };

}());