define([
    "dojo/_base/declare",
    "TreeView/widget/Commons",
    "TreeView/widget/Checkbox"
], function(declare, Commons, Checkbox) {
    "use strict"

    return declare("TreeView.widget.Commons.Colrenderer", null, {
        columnname: '',
        columnentity: '',
        columnrendermode: '',
        columnattr: '',
        columnimage: '',
        columnaction: '',
        columnclazz: '',
        columnstyle: '',
        columndateformat: '',
        columntruecaption: '',
        columnfalsecaption: '',
        columneditdataset: '',
        columneditable: false,
        columneditautocommit: true,
        columnonchangemf: '',
        columncondition: '',
        columnprefix: '',
        columnpostfix: '',

        colindex: -1,
        tree: null,
        condition: null,
        toDestruct: null,

        constructor: function (args, tree, colindex) {
            dojo.mixin(this, args);
            this.toDestruct = [];
            this.columnstyle = this.columnstyle.split(/\||\n/).join(";"); //XXX: modeler does not export ';' separated css attributes correctly. Allow newlines and pipes as separators

            this.tree = tree;
            this.colindex = colindex;

            if ((this.columneditable && this.columnattr.indexOf("/") > -1) || (this.columnrendermode == 'dataset')) {
                this.dataset = this.tree.dataset[this.columneditdataset];
                if (this.dataset == null)
                    this.tree.configError("Unknown dataset for editable reference '" + this.columnattr + "': '" + this.columneditdataset + "'");
            }

            if (this.columncondition) {
                this.condition = this.tree.conditions[this.columncondition];
                if (!this.condition)
                    this.tree.configError("Undefined condition '" + this.columncondition + "' for '" + this.columnattr + "'");
            }

        },

        appliesTo: function (renderNode) {
            return renderNode.isA(this.columnentity);
        },

        setupNode: function (parentNode) {
            dojo.attr(parentNode.parentNode, "style", this.columnstyle);
            dojo.addClass(parentNode.parentNode, this.columnclazz);

            mxui.dom.data(parentNode.parentNode, 'colindex', this.colindex)
        },

        createDefaultImage: function (parentNode) {
            if (this.columnimage) {
                dojo.place(mxui.dom.create('img', {
                    //'class' : 'gg_img ' + this.columnclazz,
                    //'style' : this.columnstyle,
                    'src': this.columnimage
                }), parentNode, 'first');
            }
        },

        invokeAction: function (record) {
            if (this.columnaction)
                this.tree.actionsByName[this.columnaction].invoke(record);
        },

        applyChange: function (record, newvalue, remove) {
            Commons.store(
                record.data(),
                this.dataset ? this.dataset.getAssoc() : this.columnattr,
                newvalue,
                this.dataset && this.dataset.isRefSet() && remove === true ? "rem" : "add",
                this.columneditautocommit && !this.columnonchangemf, //MWE: ignore auto commit setting if onchange is used
                dojo.hitch(this, this._fireOnChange, record)
            );
        },

        _fireOnChange: function (record) {
            if (this.columnonchangemf)
                Commons.mf(this.columnonchangemf, record.data(), function () {
                }, this.tree);
        },

        renderEditable: function (record, domNode, firstTime) {
            if (!firstTime)
                return;

            var attrtype = Commons.getAttributeType(this.columnentity, this.columnattr);

            //dropdown with reference selector dropdown
            if (this.columnattr.indexOf('/') > -1) {
                this.toDestruct.push(new TreeView.widget.DropDown({
                        value: Commons.objectToGuid(record.data().get(this.columnattr.split("/")[0])), //can be both guid and nothing
                        onChange: dojo.hitch(this, this.applyChange, record),
                        sticky: !this.dataset.isRefSet(),
                        className: 'gv_columnedit_dropdownmenu',
                        dataset: this.dataset,
                        label: this.dataset.rellabel
                    },
                    domNode,
                    record
                ));
            }
            else if (attrtype == "Enum" || (attrtype == "Boolean" && (this.columntruecaption || this.columnfalsecaption))) {
                var items = [];

                //boolean
                if (attrtype == "Boolean")
                    items = [
                        {value: true, label: this.columntruecaption || "Yes"},
                        {value: false, label: this.columnfalsecaption || "No"}
                    ]

                //enum map
                else {
                    var em = Commons.getEnumMap(this.columnentity, this.columnattr)
                    for (var i = 0; i < em.length; i++)
                        items.push({value: em[i].key, label: em[i].caption});
                }

                //setup dropdown
                this.toDestruct.push(new TreeView.widget.DropDown({
                        options: items,
                        value: Commons.getObjectAttr(record.data(), this.columnattr, false),
                        onChange: dojo.hitch(this, this.applyChange, record),
                        sticky: true,
                        className: 'gv_columnedit_dropdownmenu'
                    },
                    domNode,
                    record
                ));
            }
            else if (attrtype == "Boolean") {
                new Checkbox({
                        value: Commons.getObjectAttr(record.data(), this.columnattr, false),
                        onChange: dojo.hitch(this, this.applyChange, record),
                        className: 'gv_columnedit_checkbox'
                    },
                    domNode
                );
            }
            else
                this.tree.configError("This widget does not currently support edit for property " + this.columnattr + " type: " + attrtype);
        },

        render: function (record, domNode, firstTime) {
            if (this.columnaction != '')
                dojo.addClass(domNode, 'gg_clickable');

            if (this.condition && !this.condition.appliesTo(record)) {
                dojo.style(domNode.parentNode, 'display', 'none');
                return; //hide
            }

            dojo.style(domNode.parentNode, 'display', '');

            switch (this.columnrendermode) {
                case 'attribute':
                    if (this.columneditable)
                        this.renderEditable(record, domNode, firstTime)
                    else {
                        dojo.empty(domNode);
                        var attrtype = Commons.getAttributeType(this.columnentity, this.columnattr);

                        //Boolean value?
                        if (attrtype == "Boolean" && !(this.columntruecaption || this.columnfalsecaption)) {
                            this.createDefaultImage(domNode);
                            new Checkbox({ //TODO: MWE, when cleaned up?

                                    value: Commons.getObjectAttr(record.data(), this.columnattr, false),
                                    className: 'gv_columnview_checkbox',
                                    readOnly: true
                                },
                                domNode
                            );
                        }

                        //Any other value
                        else {
                            var value = this._renderAttr(record);
                            if (value === null || value === undefined)
                                value = "";

                            dojo.html.set(domNode, this.columnprefix + mxui.dom.escapeString(value).replace(/\n/g, "<br/>") + this.columnpostfix);
                            dojo.attr(domNode, 'title', value);

                            this.createDefaultImage(domNode);
                        }
                    }

                    break;
                case 'caption':
                    if (firstTime) {
                        domNode.innerHTML = this.columnprefix + this.columnname + this.columnpostfix;
                        this.createDefaultImage(domNode);
                    }
                    break;
                case 'attributehtml':
                    domNode.innerHTML = this.columnprefix + Commons.getObjectAttr(record.data(), this.columnattr, false) + this.columnpostfix;
                    this.createDefaultImage(domNode);
                    break;
                case 'attributeimage':
                    dojo.empty(domNode);

                    var url = getObjectAttr(record.data(), this.columnattr, false);
                    if (!url)
                        url = this.columnimage;

                    domNode.appendChild(mxui.dom.create("img", {
                        //'class' : 'gg_img ' + this.columnclazz,
                        //'style' : this.columnstyle,
                        'src': url
                    }));
                    break;
                case 'image':
                    if (firstTime === true)
                        this.createDefaultImage(domNode);
                    break;
                case 'thumbnail' :
                    dojo.empty(domNode);

                    var fileid = Commons.getObjectAttr(record.data(), this.columnattr == '' ? 'FileID' : this.columnattr);
                    var cd = Commons.getObjectAttr(record.data(), this.columnattr.replace(/FileID/, '') + 'changedDate');
                    domNode.appendChild(mxui.dom.create("img", {
                        //'class' : 'gg_img ' + this.columnclazz,
                        //'style' : this.columnstyle,
                        'src': 'file?thumb=true&target=internal&fileID=' + fileid + '&changedDate=' + cd
                    }));
                    break;
                case 'systemimage' :
                    dojo.empty(domNode);

                    var fileid = Commons.getObjectAttr(record.data(), this.columnattr == '' ? 'FileID' : this.columnattr);
                    var cd = Commons.getObjectAttr(record.data(), this.columnattr.replace(/FileID/, '') + 'changedDate');

                    domNode.appendChild(mxui.dom.create("img", {
                        //'class' : 'gg_img ' + this.columnclazz,
                        //'style' : this.columnstyle,
                        'src': 'file?thumb=false&target=internal&fileID=' + fileid + '&changedDate=' + cd
                    }));
                    break;
                case 'dataset':
                    //only subscribe when the record is new
                    dojo.empty(domNode)

                    if (firstTime === true) {
                        record.addSubscription(dojo.connect(this.dataset, 'onReceiveItems', dojo.hitch(this, function (items) {
                            this.render(record, domNode);
                        })))
                    }

                    var guids = record.data().getReferences(this.dataset.getAssoc());
                    if (this.dataset.hasData) {
                        dojo.forEach(guids, function (guid) {
                            var value = this.dataset.getValue(guid);
                            if (value) {
                                dojo.place(
                                    Commons.renderLabel(
                                        value,
                                        this.columneditable,
                                        {
                                            owner: record,
                                            guid: guid,
                                            dataset: this.columneditdataset,
                                            colindex: this.colindex
                                        }
                                    ), domNode
                                );
                            }
                        }, this);
                    }
                    break;
                default:
                    this.tree.configError("not implemented columnrendermode: " + this.columnrendermode);
            }
        },

        _renderAttr: function (record) {
            var object = record.data();
            var attrtype = Commons.getAttributeType(object, this.columnattr);
            var value = Commons.getObjectAttr(object, this.columnattr, attrtype != "DateTime");
            if (attrtype == "DateTime") {
                if (!value || "" == value)
                    return "";

                return dojo.date.locale.format(new Date(value), {
                    selector: 'date',
                    datePattern: this.columndateformat != "" ? this.columndateformat : "EEE dd MMM y"
                });
            }
            else if (attrtype == "Boolean" && (this.columntruecaption || this.columnfalsecaption))
                return value == "Yes" ? this.columntruecaption : this.columnfalsecaption;

            return value;
        },

        free: function () {
            dojo.forEach(this.toDestruct, function (item) {
                item.free();
            });
        }
    });
});
