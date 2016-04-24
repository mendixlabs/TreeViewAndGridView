define([
    "dojo/_base/declare",
    "TreeView/widget/Commons"
], function(declare, Commons) {
    "use strict"

    return declare("TreeView.widget.Commons.RelatedDataset", null, {
        relname: '',
        rellabel: '',
        relentity: '',
        relcontextassoc: '',
        relitemassocref: '',
        relitemassocrefset: '',
        relnameattr: '',
        relconstraint: '',
        relnewitemcaption: '',

        widget: null,
        contextGuid: null,
        hasData: false,

        existingLabels: null,
        existingLabelsById: null,
        existingOptions: null,

        _fetchingLabels: false,

        constructor: function (args, widget, cb) {
            this.widget = widget;
            dojo.mixin(this, dojo.data.util.simpleFetch);
            dojo.mixin(this, args);

            this.existingOptions = [];

            this.widget.subscribe({ //fetch the new labels if changed
                entity: this.relentity,
                callback: dojo.hitch(this, this.fetchLabels)
            });

            this.widget.connect(this.widget, "update", dojo.hitch(this, function (data, cb) {
                this.contextGuid = data && data.getGuid ? data.getGuid() : data;
                this.fetchLabels();
                mendix.lang.nullExec(cb);
            }));
        },

        getAssoc: function () {
            return this.relitemassocref != '' ? this.relitemassocref.split("/")[0] : this.relitemassocrefset.split("/")[0];
        },

        isRefSet: function () {
            return this.relitemassocrefset != '';
        },

        getValue: function (item, _) {
            if (typeof (item) == "object")
                return item.get(this.relnameattr);
            else if (/^\d+$/.test(item)) {
                var obj = this.existingLabelsById[item]; //assuming guid
                return obj ? this.getValue(obj) : null; //TODO: warn?
            }
            else
                this.widget.showError("Dataset getValue not valid for: " + item);
            return '';
        },

        getOptions: function () {
            return this.existingOptions;
        },

        fetchLabels: function () {
            if (this.contextGuid == null || this._fetchingLabels)
                return;

            this.hasData = false;
            this._fetchingLabels = true;
            var xpath = "//" + this.relentity + (this.relconstraint ? this.relconstraint : '') + (this.relcontextassoc ? "[" + this.relcontextassoc.split("/")[0] + " = '[%CurrentObject%]']" : '');
            xpath = xpath.replace(/\[\%CurrentObject\%\]/gi, this.contextGuid);
            mx.data.get({
                xpath: xpath,
                callback: dojo.hitch(this, this.retrieveLabels),
                filter: {
                    sort: [[this.relnameattr, "asc"]],
                    attributes: [this.relnameattr]
                }
            }, this);
        },

        retrieveLabels: function (objects) {
            this.rawObjects = objects;
            this.existingLabels = {};
            this.existingLabelsById = {};

            this.existingOptions = dojo.map(objects, function (obj) {
                var value = obj.getGuid();
                var label = obj.get(this.relnameattr);

                this.existingLabels[label.toLowerCase()] = obj;
                this.existingLabelsById[value] = obj;

                return {value: value, label: label}
            }, this);

            this._fetchingLabels = false;

            if (this.relnewitemcaption)
                this.existingOptions.splice(0, 0, {
                    value: 'new',
                    label: this.relnewitemcaption,
                    onClick: dojo.hitch(this, this.createNewItem)
                }, null) //Null = separator

            this.hasData = true;
            this.onReceiveItems(this.existingOptions);
        },

        onReceiveItems: function (items) {
            //connect stub
        },

        /**
         * Given a array of guids, returns a list of captions
         * @param  {[type]} items [description]
         * @return {[type]}       [description]
         */
        getCaptions: function (items) {
            return dojo.map(items, this.getValue, this);
        },

        createNewItem: function (callback) {
            var labelname = prompt("Please enter " + this.relnewitemcaption, "");
            if (labelname) {
                mx.data.create({
                    entity: this.relentity,
                    error: this.widget.showError,
                    callback: dojo.hitch(this, function (label) {
                        var cb = callback
                            ? dojo.hitch(this, callback, {
                            value: label.getGuid(),
                            label: labelname
                        })
                            : null;

                        if (this.relcontextassoc)
                            Commons.store(label, this.relcontextassoc, this.contextGuid);

                        Commons.store(label, this.relnameattr, dojo.trim(labelname), null, true, cb);
                    })
                }, this)
            }
        },

        /** dojo store compatibility, useful for future display in selects, filtering selects etc. etc.*/

        /* Identity api */
        getIdentity: function (item) {
            return item.getGuid();
        },

        getIdentityAttributes: function () {
            return null;
        },

        fetchItemByIdentity: function (args) {
            //TODO: check and error handling
            if (!this.existingLabelsById)
                args.onItem.call(args.scope, null);
            else
                args.onItem.call(args.scope, this.existingLabelsById[args.identity]);
        },

        /* Simplefetch api */
        _fetchItems: function (query, resultcallback) {
            var results = [];
            if (this.existingLabels != null)
                for (var key in this.existingLabels)
                    if (key.indexOf(query.query.name.toLowerCase()) == 0)
                        results.push(this.existingLabels[key]);

            resultcallback(results, query);
        }
    });
});
