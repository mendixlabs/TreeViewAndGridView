define([
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dojo/data/util/simpleFetch",
], function (declare, lang) {
    "use strict";

    var Commons = declare("TreeView.widget.Commons", null, {
        //MX5 hack
        fixObjProps: function (widget, props) {
            logger.debug("TreeView.widget.Commons.fixObjProps");

            var args = {};

            for (var i = 0; i < props.length; i++) {
                var prop = props[i];
                var arr = widget[prop];

                for (var j = 0; j < arr.length; j++) {
                    var obj = arr[j];

                    for (var p in obj) {
                        (args[p] || (args[p] = [])).push(obj[p]);
                    }
                }
            }

            for (var a in args) {
                widget[a] = args[a].join(";");
            }
        },

        getEnumMap: function (classname, attrname) {
            logger.debug("TreeView.widget.Commons.getEnumMap");

            var meta = mx.meta.getEntity(classname);

            if (this.getAttributeType(classname, attrname) != "Enum") {
                throw "Not an enumeration: " + arguments.join(".");
            }

            return meta.getEnumMap(attrname);
        },

        /**
         * Renders a label,
         * @param  {[type]} name  [description]
         * @param  {[type]} close [description]
         * @param  {[type]} data  [datamap object to be attached to the domnode]
         * @return {[type]} node      [description]
         */
        renderLabel: function (name, close, data) {
            logger.debug("TreeView.widget.Commons.renderLabel");

            var n = mxui.dom.create(
                "span",
                { "class": "gv_label" },
                mxui.dom.create(
                    "span",
                    { "class": "gv_label_name" },
                    name ? name : ""
                )
            );

            if (close) {
                dojo.place(mxui.dom.create(
                    "span",
                    { "class": "gv_label_close" },
                    "x"
                ), n);
            }

            mxui.dom.data(n, "data", data);
            return n;
        },

        getAttributeType: function (classnameOrObject, attr) {
            logger.debug("TreeView.widget.Commons.getAttributeType");

            var parts = attr.split("/");
            if (parts.length == 3) {
                return this.getAttributeType(parts[1], parts[2]);
            }

            if (attr.indexOf("/") == -1) {
                if (classnameOrObject.getEntity) {
                    classnameOrObject = classnameOrObject.getEntity();
                }

                var meta = mx.meta.getEntity(classnameOrObject);
                return meta.getAttributeType(attr);
            }

            return false;
        },

        getObjectAttr: function (object, attr, renderValue) {
            logger.debug("TreeView.widget.Commons.getObjectAttr");

            if (!object || !attr) {
                return "";
            }

            if (attr.indexOf("/") == -1) {
                if (renderValue) {
                    return mx.parser && mx.parser.formatAttribute ? mx.parser.formatAttribute(object, attr) : mxui.html.renderValue(object, attr); //mxui.html.rendervalue moved in 5.~7.
                }
                return object.get(attr);
            }
            var parts = attr.split("/");
            if (parts.length == 3) {
                var child = object.getReference(parts[0]);

                if (!child) {
                    return "";
                }

                //Fine, we have an object
                if (dojo.isObject(child)) {
                    child = object.getChild(parts[0]); //Get child only works if child was not a guid but object
                    return this.getObjectAttr(child, parts[2], renderValue);
                }

                //Try to retrieve guid in syc
                else {
                    //..but, there is a guid...
                    var tmp = null;
                    mx.data.get({
                        guid: child, noCache: false, callback: function (obj) { //async = false option would be nice!
                            tmp = obj;
                        }
                    });
                    if (tmp != null) {//callback was invoked in sync :)
                        return this.getObjectAttr(tmp, parts[2], renderValue);
                    }

                    console && console.warn && console.warn("Commons.getObjectAttr failed to retrieve " + attr );
                    //This happens if no retrieve schema was used :-(.
                    return "";
                }
            }

            //objects can be returned in X different ways, sometime just a guid, sometimes its an object...
            if (parts.length == 2) {
                var result = object.getReferences(parts[0]); //incase of of a get object, return the Guids (but sometimes getAttribute gives the object...)
                if (!result || result.length == 0) {
                    return "";
                }
                if (result.guid) {
                    return result.guid;
                }
                if (/\d+/.test(result)) {
                    return result;
                }
            }
            throw "GridCommons.getObjectAttr: Failed to retrieve attribute '" + attr + "'";
        },

        getObjectAttrAsync: function (object, attr, renderValue, cb) {
            logger.debug("TreeView.widget.Commons.getObjectAttrAsync");

            if (!object || !attr) {
                return cb("");
            }

            if (attr.indexOf("/") == -1) {
                if (renderValue) {
                    return cb(mx.parser && mx.parser.formatAttribute ? mx.parser.formatAttribute(object, attr) : mxui.html.renderValue(object, attr)); //mxui.html.rendervalue moved in 5.~7.
                }
                return cb(object.get(attr));
            }
            var parts = attr.split("/");
            if (parts.length == 3) {
                var child = object.getReference(parts[0]);

                if (!child) {
                    return cb("");
                }

                //Fine, we have an object
                if (dojo.isObject(child)) {
                    child = object.getChild(parts[0]); //Get child only works if child was not a guid but object
                    return cb(this.getObjectAttr(child, parts[2], renderValue));
                }

                //Try to retrieve guid in syc
                else {
                    //..but, there is a guid...
                    mx.data.get({
                        guid: child,
                        noCache: false,
                        callback: lang.hitch(this, function (obj) { //async = false option would be nice!
                            if (obj != null) {//callback was invoked in sync :)
                                return this.getObjectAttrAsync(obj, parts[2], renderValue, cb);
                            }

                            console && console.warn && console.warn("Commons.getObjectAttr failed to retrieve " + attr );
                            //This happens if no retrieve schema was used :-(.
                            return cb("");
                        })
                    });
                    return;
                }
            }

            //objects can be returned in X different ways, sometime just a guid, sometimes its an object...
            if (parts.length == 2) {
                var result = object.getReferences(parts[0]); //incase of of a get object, return the Guids (but sometimes getAttribute gives the object...)
                if (!result || result.length == 0) {
                    return cb("");
                }
                if (result.guid) {
                    return cb(result.guid);
                }
                if (/\d+/.test(result)) {
                    return cb(result);
                }
            }
            throw "GridCommons.getObjectAttr: Failed to retrieve attribute '" + attr + "'";
        },

        objectToGuid: function (thing) {
            logger.debug("TreeView.widget.Commons.objectToGuid");

            if (!thing) {
                return null;
            } else if (thing.guid) {
                return thing.guid;
            } else if (thing.getGuid) {
                return thing.getGuid();
            } else if (/^\d+$/.test(thing)) {
                return thing;
            }
            throw "Does not look like a MxObject: " + thing;
        },

        /**
         * Stores data
         * @param  {[type]}   object   [object or list of mxobjects to change]
         * @param  {[type]}   attr     [attribute or reference to update]
         * @param  {[type]}   value    [the new value(s): primitive, guid(s) or mxobject(s)]
         * @param  {[type]}   mode     ["add", "rem" or empty / "set"]
         * @param  {[type]}   commit   [commit or save?]
         * @param  {Function} callback [callback function]
         * @return {[type]}            [description]
         */
        store: function (object, attr, value, mode, commit, callback) {
            logger.debug("TreeView.widget.Commons.store");

            var res = false;

            //list of objects
            if (dojo.isArray(object)) {
                var left = 1;
                var cb = function () {
                    left -= 1;
                    if (left < 1) {
                        callback && callback();
                    }
                };

                for (var i = 0; i < object.length; i++) {
                    left += 1;
                    // TODO: Check scoping, jshint says store does not work. Should it be this.store?
                    store(object[i], attr, value, mode, commit, cb);
                }

                cb();
            } else { //single object
                var parts = attr.split("/");
                attr = parts[0];
                if (!object.has(attr)) {
                    throw "Commons.store: Unable to read or write attribute '" + attr + "'. Does the user have sufficient permission and is the attribute retrieved from the server?";
                }

                //simple attribute
                if (parts.length === 1 && attr.indexOf(".") === -1) {
                    res = object.set(attr, value);
                }

                //reference
                else if (parts.length === 1 || parts.length === 2) {
                    var isRefSet = object.isObjectReferenceSet(attr);

                    //reference set
                    if (isRefSet) {
                        var guids;
                        if (dojo.isArray(value)) {
                            guids = dojo.map(value, this.objectToGuid);
                        } else if (!value) {
                            guids = [];
                        } else {
                            guids = [this.objectToGuid(value)];
                        }

                        switch (mode) {
                            case "add":
                                res = object.addReferences(attr, guids);
                                break;
                            case "rem":
                                res = object.removeReferences(attr, guids);
                                break;
                            default:
                                res = object.set(attr, guids);
                        }
                    } else { //single reference
                        if (dojo.isArray(value)) {
                            throw "Commons.store: cannot assign array to reference";
                        }

                        var guid = this.objectToGuid(value);
                        res = object.set(attr, guid ? guid : ""); //client needs '' as empty
                    }
                }

                else {
                    throw "Commons.store: unsupported attribute path: " + attr;
                }

                //check res
                if (res === false) { //set returns undefined if ok, or false on failure
                    throw "Commons.store: Unable to update attribute: " + attr;
                }

                mx.data.commit({
                    mxobj: object,
                    error: this.error,
                    callback: function () {
                        callback && callback();
                    }
                });
            }
        },


        /**
         * MWE, since the liveConnect does not work properly with bubbling en event propagion, we implement our own...
         * @param {[type]} widget  [description]
         * @param {[type]} node  [description]
         * @param {[type]} event [description]
         * @param {[type]} map of className -> function(node, event) -> boolean. (If false, further event are stopped)
         */
        liveConnect: function (widget, node, event, map) {
            logger.debug("TreeView.widget.Commons.liveConnect");

            if (!node) {
                throw "liveConnect: no node provided";
            }

            widget.connect(node, event, function (e) {
                var currNode = e.target;
                var matched = {}; //we already matched these, don't bubble.

                while (currNode != node && currNode != null) {
                    for (var clazz in map) {
                        if (!(clazz in matched) && dojo.hasClass(currNode, clazz)) {
                            //avoid a second match on the same selector
                            matched[clazz] = true;

                            //call the callback
                            var res = map[clazz].call(widget, currNode, e);

                            //stop the event!
                            if (res === false) {
                                e && e.stopPropagation(); // dojo.stopEvent(e);
                                return;
                            }
                        }
                    }
                    currNode = currNode.parentNode;
                }
            });
        },

        /**
         * Shows a confirm dialog. If the message is empty, the dialog is skipped altogether, and the callback is invoked inmediately
         * @param  {[type]}   message  [description]
         * @param  {Function} callback [description]
         */
        confirm: function (message, callback, yescaption, nocaption) {
            logger.debug("TreeView.widget.Commons.confirm");

            if (!message) {
                callback && callback();
                return;
            }

            mx.ui.confirmation({
                content: message,
                proceed: yescaption || "Yes",
                cancel: nocaption || "Cancel",
                handler: callback
            });
        },

        mf: function (mfname, data, callback, context, mfNeedsList, progressMessage) {
            logger.debug("TreeView.widget.Commons.mf");

            //firing on multiple items? wait for all items to finish
            if (dojo.isArray(data) && !mfNeedsList) {
                var left = data.length;
                var cb = function () {
                    left -= 1;
                    if (left < 1 && callback) {
                        callback.call(context || window);
                    }
                };
                var self = this;
                dojo.forEach(data, function (dataitem) {
                    self.mf(mfname, dataitem, cb, context, false, progressMessage);
                });
            } else {
                var guids = dojo.map(dojo.isArray(data) ? data : [data], this.objectToGuid);

                if (guids.length > 1 && !mfNeedsList) {
                    throw "Multiple selection found, but microflow supports only one argument!";
                }

                mx.ui.action(mfname, {
                    params: {
                        applyto: "selection",
                        guids: guids
                    },
                    progressMsg: progressMessage,
                    progress: progressMessage ? "modal" : undefined,
                    error: function () {
                        // TODO: This is useless, error is not defined (this.error?)
                        // if (error) {
                        //     error();
                        // }
                    },
                    callback: function (_, data) {
                        if (callback) {
                            callback.call(context || window);
                        }
                    },
                    async: !!progressMessage
                });
            }
        },

        configError: function (widget, msg) {
            logger.debug("TreeView.widget.Commons.configError");

            msg = "Configuration error in " + widget.id + ": " + msg;
            if (console) {
                console.error(msg);
            }
            widget.domNode.innerHTML = msg;
            throw msg;
        },

        error: function (e) {
            logger.debug("TreeView.widget.Commons.error");

            console.error(e);
            throw e;
        },

        /**
         * splits the given properties up to objects in target per index. First property indicates targetobjects name
         */
        splitPropsTo: function (widget, propnames, target) {
            logger.debug("TreeView.widget.Commons.splitPropsTo");

            var props = propnames.split(",");
            var rawdata = {};

            var nameprop = props[0];
            for (var i = 0; i < props.length; i++) {
                rawdata[props[i]] = widget[props[i]] ? widget[props[i]].split(";") : "";
            }

            //create target objects
            for (i = 0; i < rawdata[nameprop].length; i++) {
                var obj = {};
                var hasdata = false;
                for (var key in rawdata) {
                    var val = obj[key] = rawdata[key][i] || ""; // if undefined make an empty string.
                    if (/^true$/.test(obj[key])) {
                        obj[key] = true;
                    } else if (/^false$/.test(obj[key])) {
                        obj[key] = false;
                    }
                    hasdata = hasdata || (val !== "");
                }
                if (hasdata) {//if the object does not contain any data at all, skip it
                    target.push(obj);
                }
            }
        },

        /**
         * Data from contexts might either be a guid or an object. Normalize to an object and invoke callback
         * @param  {[type]} data [null, guid or mx object]
         * @param  {[function(object, guid)]} cb to be invoked when resolved [description]
         * @return {[type]}      [description]
         */
        normalizeContext: function (data, cb) {
            logger.debug("TreeView.widget.Commons.normalizeContext");

            //Nothing
            if (data == null) {
                cb(null, null);
            } else if (typeof (data) != "object" && /^\d+$/.test(data)) { //GUid only
                mx.data.get({
                    guid: data,
                    callback: function (mxobj) {
                        if (mxobj == null) {
                            cb(null, null);
                        } else {
                            cb(mxobj, mxobj.getGuid());
                        }
                    },
                    error: this.showError
                }, this);
            }
            //Context is mxobj object
            else {
                var guid = data.getGuid();
                cb(data, guid);
            }
        }
    });

    return new Commons();
});
