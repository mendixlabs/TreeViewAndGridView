dojo.provide("TreeView.widget.Commons");
dojo.require("dojo.data.util.simpleFetch");
dojo.require("dijit.form.DropDownButton"); //DropDownMenu in dojo 1.7!
dojo.require("dijit.form.ComboBox");
dojo.require("dijit.form.Button");
dojo.require("dijit.Menu");
dojo.require("dijit.MenuItem");
dojo.require("dijit.form.FilteringSelect");
dojo.require("dijit.form.Select");
dojo.require("dijit.Dialog"); //fix for #101262

dojo.setObject("TreeView.widget.Commons", (function() {


	//MX5 hack
	function fixObjProps (widget, props) {
		var args = {};

		for (var i = 0, prop; prop = props[i]; i++) {
			var arr = widget[prop];

			for (var j = 0, obj; obj = arr[j]; j++) {
				for (var p in obj) {
					(args[p] || (args[p] = [])).push(obj[p]);
				}
			}
		}

		for (var a in args) {
			widget[a] = args[a].join(";");
		}
	}


	function getEnumMap(classname, attrname) {
		var meta = mx.metadata.getMetaEntity(classname);

		if (getAttributeType(classname, attrname) != 'Enum')
			throw "Not an enumeration: " + args.join(".");

		return meta.getEnumMap(attrname);
	}

	/**
	 * Renders a label,
	 * @param  {[type]} name  [description]
	 * @param  {[type]} close [description]
	 * @param  {[type]} data  [datamap object to be attached to the domnode]
	 * @return {[type]} node      [description]
	 */
	function renderLabel(name, close, data) {
		var n = mxui.dom.span(
			{ 'class' : 'gv_label' },
			mxui.dom.span(
				{ 'class' : 'gv_label_name' },
				name ? name : ""
			)
		);

		if (close)
			dojo.place(mxui.dom.span(
				{ 'class' : 'gv_label_close' },
				'x'
			), n);

		mxui.dom.data(n, "data", data);
		return n;
	}

	function getAttributeType(classnameOrObject, attr) {
		var parts = attr.split("/");
		if (parts.length == 3)
			return getAttributeType(parts[1], parts[2])

		if (attr.indexOf("/") == -1) {
			if (classnameOrObject.getClass)
				classnameOrObject = classnameOrObject.getClass();

			var meta = mx.metadata.getMetaEntity(classnameOrObject);
			return meta.getAttributeClass(attr);
		}

		return false;
	}


	function getObjectAttr (object, attr, renderValue) {
		if (!object || !attr)
			return "";

		if (attr.indexOf("/") == -1) {
			if (renderValue)
				return mx.parser && mx.parser.formatAttribute ? mx.parser.formatAttribute(object, attr) : mxui.html.renderValue(object, attr); //mxui.html.rendervalue moved in 5.~7.
			return object.getAttribute(attr);
		}
		var parts = attr.split("/");
		if (parts.length == 3) {
			var child = object.get(parts[0]);

			if (!child)
				return "";

			//Fine, we have an object
			if (dojo.isObject(child)) {
				child = object.getChild(parts[0]); //Get child only works if child was not a guid but object
				return getObjectAttr(child, parts[2], renderValue);
			}

			//Try to retrieve guid in syc
			else {
				//..but, there is a guid...
				var tmp = null;
				mx.processor.get({ guid : child, noCache : false, callback : function(obj) { //async = false option would be nice!
					tmp = obj;
				}});
				if (tmp != null) //callback was invoked in sync :)
					return getObjectAttr(tmp, parts[2], renderValue);

				//console && console.warn && console.warn("Commons.getObjectAttr failed to retrieve " + attr );
				//This happens if no retrieve schema was used :-(.
				return "";
			}

		}

		//objects can be returned in X different ways, sometime just a guid, sometimes its an object...
		if (parts.length == 2) {
			var result = object.getAttribute(parts[0]); //incase of of a get object, return the GUIDs (but sometimes getAttribute gives the object...)
			if (!result)
				return "";
			if (result.guid)
				return result.guid;
			if (/\d+/.test(result))
				return result;
		}
		throw "GridCommons.getObjectAttr: Failed to retrieve attribute '" + attr + "'";

	}


	function objectToGuid(thing) {
		if (!thing)
			return null;
		if (thing.guid)
			return thing.guid;
		if (thing.getGUID)
			return thing.getGUID();
		if (/^\d+$/.test(thing))
			return thing;
		throw "Does not look like a MxObject: " + thing;
	}


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
	function store(object, attr, value, mode, commit, callback) {
		var res = false;

		//list of objects
		if (dojo.isArray(object)) {
			var left = 1;
			var cb = function() {
				left -= 1;
				if (left < 1)
					callback && callback();
			}

			for (var i = 0; i < object.length; i++) {
				left += 1;
				store(object[i], attr, value, mode, commit, cb);
			};

			cb();
		}

		//single object
		else {
			var parts = attr.split("/");
			attr = parts[0]
			if (!object.has(attr))
				throw "Commons.store: Unable to read or write attribute '" + attr + "'. Does the user have sufficient permission and is the attribute retrieved from the server?"

			//simple attribute
			if (parts.length == 1 && attr.indexOf(".") == -1)
				res  = object.set(attr, value)

			//reference
			else if (parts.length == 1 || parts.length == 2) {
				var isRefSet = object.isObjectReferenceSet(attr);

				//reference set
				if (isRefSet) {
					var guids;
					if (dojo.isArray(value))
						guids = dojo.map(value, objectToGuid);
					else if (!value)
						guids = [];
					else
						guids = [objectToGuid(value)]


					switch(mode) {
						case "add" :
							res = object.addReferences(attr, guids);
							break;
						case "rem" :
							res = object.removeReferences(attr, guids);
							break;
						default:
							res = object.set(attr, guids);
					}
				}

				//single reference
				else {
					if (dojo.isArray(value))
						throw "Commons.store: cannot assign array to reference";

					var guid = objectToGuid(value);
					res = object.set(attr, guid ? guid : "") //client needs '' as empty
				}
			}

			else
				throw "Commons.store: unsupported attribute path: " + attr;

			//check res
			if (res === false) //set returns undefined if ok, or false on failure
				throw "Commons.store: Unable to update attribute: " + attr;

			mx.processor[commit === true ? 'commit' : 'save']({
				mxobj: object,
				error : error,
				callback : function() {
					callback && callback();
				}
			})
		}
	}


	/**
		* MWE, since the liveConnect does not work properly with bubbling en event propagion, we implement our own...
		* @param {[type]} widget  [description]
		* @param {[type]} node  [description]
		* @param {[type]} event [description]
		* @param {[type]} map of className -> function(node, event) -> boolean. (If false, further event are stopped)
		*/
	function liveConnect(widget, node, event, map) {
			if (!node)
				throw "liveConnect: no node provided"
			widget.connect(node, event, function(e) {
					var currNode = e.target;
					var matched = {}; //we already matched these, don't bubble.

					while(currNode != node && currNode != null){
							for(var clazz in map) {
									if (!(clazz in matched) && dojo.hasClass(currNode, clazz)) {
											//avoid a second match on the same selector
											matched[clazz] = true;

											//call the callback
											var res = map[clazz].call(widget, currNode, e);

											//stop the event!
											if (res === false)  {
												e && e.stopPropagation(); // dojo.stopEvent(e);
												return;
											}
									}
							}
							currNode = currNode.parentNode;
					}

					//e && dojo.stopEvent(e);

			});
	}

	/**
	 * Shows a confirm dialog. If the message is empty, the dialog is skipped altogether, and the callback is invoked inmediately
	 * @param  {[type]}   message  [description]
	 * @param  {Function} callback [description]
	 * @return {[type]}            [description]
	 */
	function confirm(message, callback, yescaption, nocaption) {
		if (!message) {
			callback && callback();
			return;
		}

		mx.ui.confirmation({
		    content: message,
		    proceed: yescaption || "Yes",
		    cancel: nocaption || "Cancel",
		    handler : callback
		});
	}

	function mf (mfname, data, callback, context, mfNeedsList, progressMessage) {
		//firing on multiple items? wait for all items to finish
		if (dojo.isArray(data) && !mfNeedsList) {
			var left = data.length;
			var cb = function() {
				left -= 1;
				if (left < 1 && callback)
					callback.call(context || window);
			}
			dojo.forEach(data, function(dataitem) {
				mf(mfname, dataitem, cb, context, false, progressMessage);
			});

		}

		else {
			var guids = dojo.map(dojo.isArray(data) ? data : [data], objectToGuid);

			if (guids.length > 1 && !mfNeedsList)
				throw "Multiple selection found, but microflow supports only one argument!";

			mx.ui.action(mfname, {
					store        : {
						caller	: context.mxform
					},
					params : {
						applyto     : 'selection',
						guids       : guids
					},
					progressMsg : progressMessage,
					progress    : progressMessage ? "modal" : undefined,
					error       : function() {
						if (error)
							error();
					},
					callback    : function(_, data) {
							if (callback)
									callback.call(context || window);
					},
					async : !!progressMessage
			});
		}
	}

	function configError (widget, msg) {
			msg = "Configuration error in " + widget.id + ": " + msg;
			if (console)
				console.error(msg);
			widget.domNode.innerHTML = msg;
			throw msg;
	}

	function error(e) {
			console.error(e);
			throw e;
	}

	/**
		* splits the given properties up to objects in target per index. First property indicates targetobjects name
		*/
	function splitPropsTo(widget, propnames, target) {
			var props = propnames.split(",");
			var rawdata = {};

			var nameprop = props[0];
			for(var i = 0; i < props.length; i++)
					rawdata[props[i]] = widget[props[i]].split(";");

			//create target objects
			for(i = 0; i < rawdata[nameprop].length; i++){
					var obj = {};
					var hasdata = false;
					for (var key in rawdata) {
							var val = obj[key] = rawdata[key][i];
							if (/^true$/.test(obj[key]))
									obj[key] = true;
							else if (/^false$/.test(obj[key]))
									obj[key] = false;
							hasdata = hasdata || (val !== "");
					}
					if (hasdata) //if the object does not contain any data at all, skip it
							target.push(obj);
			}
	}

	/**
	 * Data from contexts might either be a guid or an object. Normalize to an object and invoke callback
	 * @param  {[type]} data [null, guid or mx object]
	 * @param  {[function(object, guid)]} cb to be invoked when resolved [description]
	 * @return {[type]}      [description]
	 */
	function normalizeContext(data, cb) {
		//Nothing
		if (data == null)
			cb(null, null);
		//GUid only
		else if (typeof(data) != "object" && /^\d+$/.test(data)) {
			mx.processor.get({
				guid: data,
				callback : function(mxobj) {
					if (mxobj == null)
						cb(null, null)
					else
						cb(mxobj, mxobj.getGUID())
				},
				error : this.showError
			}, this);
		}
		//Context is mxobj object
		else {
			var guid = data.getGUID();
			cb(data, guid);
		}
	}

	return {
		getObjectAttr : getObjectAttr,
		liveConnect   : liveConnect,
		mf            : mf,
		configError   : configError,
		splitPropsTo  : splitPropsTo,
		error         : error,
		getAttributeType : getAttributeType,
		getEnumMap    : getEnumMap,
		renderLabel   : renderLabel,
		normalizeContext : normalizeContext,
		objectToGuid  : objectToGuid,
		store         : store,
		get           : getObjectAttr,
		confirm       : confirm,
		fixObjProps	  : fixObjProps
	}
})(), window);


dojo.declare("TreeView.widget.DropDown", null, {
	onChange : null,
	label    : null,
	options  : null,
	value    : null,
	dataset  : null,
	className: null,
	sticky   : true,

	_datasetsub    : null,

	constructor : function(args, domNode, owner) {
		dojo.mixin(this, args);
		this.options = this.options || [];

		if (this.dataset) {
			this._datasetsub = dojo.connect(this.dataset, 'onReceiveItems', dojo.hitch(this, this.receiveDatasetItems));
			if (owner)
				owner.addSubscription(this._datasetsub);

		}

		this.menu = new dijit.Menu({
			style: "display: none;"
		});

		this.dropdown = new dijit.form.DropDownButton({
			label : this.label,
			dropDown : this.menu,
			onClick : function(e) {
				dojo.stopEvent(e);
			}
		});
		this.domNode = this.dropdown.domNode;

		dojo.addClass(this.dropdown.dropDown.domNode, 'gv_dropdown_menu ' + this.className);
		dojo.addClass(this.dropdown.domNode, 'gv_dropdown ' + this.className);

		dojo.place(this.dropdown.domNode, domNode);

		this.addOptions(this.options);

		if (this.dataset)
			this.addOptions(this.dataset.getOptions());
	},

	receiveDatasetItems : function(items) {
		this.clearItems();
		this.addOptions(this.options);
		this.addOptions(items);
	},

	addOptions : function(items) {
		dojo.forEach(items, function(item) {
			this.menu.addChild(this.createOption(item));
		}, this);
	},

	clearItems : function() {
		dojo.forEach(this.menu.getChildren(), function(child) {
			this.menu.removeChild(child);
		}, this);
	},

	createOption : function(item) {
		//separator
		if (item == null)
			return new dijit.MenuSeparator();

		if (this.sticky && this.value !== null && this.value == item.value) //redraw selection if needed
			this.dropdown.set('label', item.label);

		return new dijit.MenuItem({
			label : mxui.dom.escapeHTML(item.label),
			value : item.value,
			onClick : item.onClick
				? dojo.hitch(item, item.onClick, dojo.hitch(this, this.itemClick)) //pass itemClick as callback to the onClick, so it can be invoked
				: dojo.hitch(this, this.itemClick, item)
		});
	},

	itemClick : function(item, e) {
		this.onChange.call(null, item.value);
		if (this.sticky) {
			this.dropdown.set('label', item.label);
			this.value = item.value;
		}
		e && dojo.stopEvent(e);
	},

	/* dojo get & set proxying */
	set : function() {
		if (!this.dropdown._destroyed)
			return this.dropdown.set.apply(this.dropdown, arguments);
		return undefined;
	},

	get : function() {
		if (!this.dropdown._destroyed)
			return this.dropdown.get.apply(this.dropdown, arguments);
		return undefined;
	},

	destroy : function() {
		if (this._datasetsub)
			dojo.disconnect(this._datasetsub);
		this.dropdown.destroy();
		this._destroyed = true;
	},

	free : function() {
		this.destroy(); //Free is used by commons, destroy by Mendix widgets
	}

});

dojo.declare("TreeView.widget.Checkbox", null, {
	onChange : null,
	value    : null,
	className: null,
	readOnly : false,

	_clickSubscription: null,

	constructor : function(args, domNode) {
		dojo.mixin(this, args);

		this.checkbox = mendix.dom.input({
			type : "checkbox"
		});

		dojo.attr(this.checkbox, "checked", this.value);
		dojo.attr(this.checkbox, "readonly", this.readOnly);
		dojo.attr(this.checkbox, "disabled", this.readOnly);

		if (!this.readOnly)
			this._clickSubscription = dojo.connect(this.checkbox, "onchange", dojo.hitch(this, this.change));

		dojo.addClass(this.checkbox, 'gv_checkbox ' + this.className);

		dojo.place(this.checkbox, domNode);
	},

	change : function(e) {
		this.onChange.call(null, this.checkbox.checked);
		e && e.stopPropagation();
	},

	/* dojo get & set proxying */
	set : function() {
		return undefined;
	},

	get : function() {
		return undefined;
	},

	destroy : function() {
		if (this._clickSubscription)
			dojo.disconnect(this._clickSubscription);
	}

});

dojo.declare("TreeView.widget.Condition", null, {
	condname   : '',
	condattr   : '',
	condvalues : '',
	condclass  : '',

	widget : null,
	values : null,

	constructor : function(args, widget) {
		dojo.mixin(this, args);
		this.widget = widget;

		//always compare strings
		this.values = dojo.map(("" + this.condvalues).split("\\n"), function(s) { return dojo.trim(s); });
	},

	getClass : function() {
		return this.condclass;
	},

	appliesTo : function(record) {
		var value = TreeView.widget.Commons.get(record.data(), this.condattr);
		if (value === null || value === undefined || /^\s*$/.test("" + value)) {
			if (dojo.indexOf(this.values, "false") != -1) //This one was suppossed to match on falsy values
				return true;
			else
				return  false;
		}
		return -1 != dojo.indexOf(this.values, "" + value);
	}

})

dojo.declare("TreeView.widget.Colrenderer", null, {

	columnname : '',
	columnentity : '',
	columnrendermode : '',
	columnattr : '',
	columnimage : '',
	columnaction : '',
	columnclazz : '',
	columnstyle : '',
	columndateformat : '',
	columntruecaption : '',
	columnfalsecaption : '',
	columneditdataset : '',
	columneditable : false,
	columneditautocommit : true,
	columnonchangemf: '',
	columncondition : '',
	columnprefix : '',
	columnpostfix : '',

	colindex : -1,
	tree : null,
	condition : null,
	toDestruct : null,

	constructor : function(args, tree, colindex) {
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

	appliesTo : function(renderNode) {
		return renderNode.isA(this.columnentity);
	},

	setupNode : function(parentNode) {
		dojo.attr(parentNode.parentNode, "style", this.columnstyle);
		dojo.addClass(parentNode.parentNode, this.columnclazz);

		mxui.dom.data(parentNode.parentNode, 'colindex', this.colindex)
	},

	createDefaultImage : function(parentNode) {
		if (this.columnimage) {
			dojo.place(mxui.dom.img({
				//'class' : 'gg_img ' + this.columnclazz,
				//'style' : this.columnstyle,
				'src'   : this.columnimage
			}), parentNode, 'first');
		}
	},

	invokeAction : function(record) {
		if (this.columnaction)
			this.tree.actionsByName[this.columnaction].invoke(record);
	},

	applyChange : function(record, newvalue, remove) {
		TreeView.widget.Commons.store(
			record.data(),
			this.dataset ?  this.dataset.getAssoc() : this.columnattr,
			newvalue,
			this.dataset && this.dataset.isRefSet() && remove === true ? "rem" : "add",
			this.columneditautocommit && !this.columnonchangemf, //MWE: ignore auto commit setting if onchange is used
			dojo.hitch(this, this._fireOnChange, record)
		);
	},

	_fireOnChange : function(record) {
		if (this.columnonchangemf)
			TreeView.widget.Commons.mf(this.columnonchangemf, record.data(), function() {}, this.tree);
	},

	renderEditable : function(record, domNode, firstTime) {
		if (!firstTime)
			return;

		var attrtype = TreeView.widget.Commons.getAttributeType(this.columnentity, this.columnattr);

		//dropdown with reference selector dropdown
		if (this.columnattr.indexOf('/') > -1) {
			this.toDestruct.push(new TreeView.widget.DropDown({
					value    : TreeView.widget.Commons.objectToGuid(record.data().get(this.columnattr.split("/")[0])), //can be both guid and nothing
					onChange : dojo.hitch(this, this.applyChange, record),
					sticky   : !this.dataset.isRefSet(),
					className: 'gv_columnedit_dropdownmenu',
					dataset  : this.dataset,
					label    : this.dataset.rellabel
				},
				domNode,
				record
			));
		}
		else if (attrtype == "Enum" || (attrtype == "Boolean" && (this.columntruecaption || this.columnfalsecaption)) ) {
			var items=[];

			//boolean
			if (attrtype == "Boolean")
				items = [
					{ value : true,  label : this.columntruecaption  || "Yes" },
					{ value : false, label : this.columnfalsecaption || "No"  }
				]

			//enum map
			else {
				var em = TreeView.widget.Commons.getEnumMap(this.columnentity, this.columnattr)
				for (var i = 0; i < em.length; i++)
					items.push({ value : em[i].key, label : em[i].caption });
			}

			//setup dropdown
			this.toDestruct.push(new TreeView.widget.DropDown({
					options  : items,
					value    : TreeView.widget.Commons.getObjectAttr(record.data(), this.columnattr, false),
					onChange : dojo.hitch(this, this.applyChange, record),
					sticky   : true,
					className: 'gv_columnedit_dropdownmenu'
				},
				domNode,
				record
			));
		}
		else if (attrtype == "Boolean") {
			new TreeView.widget.Checkbox({
					value    : TreeView.widget.Commons.getObjectAttr(record.data(), this.columnattr, false),
					onChange : dojo.hitch(this, this.applyChange, record),
					className: 'gv_columnedit_checkbox'
				},
				domNode
			);
		}
		else
			this.tree.configError("This widget does not currently support edit for property " + this.columnattr + " type: " + attrtype);
	},

	render : function(record, domNode, firstTime) {
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
					var attrtype = TreeView.widget.Commons.getAttributeType(this.columnentity, this.columnattr);

					//Boolean value?
					if (attrtype == "Boolean" && !(this.columntruecaption || this.columnfalsecaption)) {
						this.createDefaultImage(domNode);
						new TreeView.widget.Checkbox({ //TODO: MWE, when cleaned up?

								value    : TreeView.widget.Commons.getObjectAttr(record.data(), this.columnattr, false),
								className: 'gv_columnview_checkbox',
								readOnly : true
							},
							domNode
						);
					}

					//Any other value
					else {
						var value = this._renderAttr(record);
						if (value === null || value === undefined)
							value = "";
						
						dojo.html.set(domNode, this.columnprefix + mxui.dom.escapeHTML(value).replace(/\n/g,"<br/>")  + this.columnpostfix);
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
				domNode.innerHTML = this.columnprefix + TreeView.widget.Commons.getObjectAttr(record.data(), this.columnattr, false) + this.columnpostfix;
				this.createDefaultImage(domNode);
				break;
			case 'attributeimage':
				dojo.empty(domNode);

				var url = TreeView.widget.Commons.getObjectAttr(record.data(), this.columnattr, false);
				if (!url)
					url = this.columnimage;

				domNode.appendChild(mxui.dom.img({
					//'class' : 'gg_img ' + this.columnclazz,
					//'style' : this.columnstyle,
					'src'   : url
				}));
				break;
			case 'image':
				if (firstTime === true)
					this.createDefaultImage(domNode);
				break;
			case 'thumbnail' :
				dojo.empty(domNode);

				var fileid = TreeView.widget.Commons.getObjectAttr(record.data(), this.columnattr == '' ? 'FileID' : this.columnattr);
				var cd     = TreeView.widget.Commons.getObjectAttr(record.data(), this.columnattr.replace(/FileID/,'') + 'changedDate');
				domNode.appendChild(mxui.dom.img({
					//'class' : 'gg_img ' + this.columnclazz,
					//'style' : this.columnstyle,
					'src'   : 'file?thumb=true&target=internal&fileID=' + fileid + '&changedDate='+cd
				}));
				break;
			case 'systemimage' :
				dojo.empty(domNode);

				var fileid = TreeView.widget.Commons.getObjectAttr(record.data(), this.columnattr == '' ? 'FileID' : this.columnattr);
				var cd     = TreeView.widget.Commons.getObjectAttr(record.data(), this.columnattr.replace(/FileID/,'') + 'changedDate');

				domNode.appendChild(mxui.dom.img({
					//'class' : 'gg_img ' + this.columnclazz,
					//'style' : this.columnstyle,
					'src'   : 'file?thumb=false&target=internal&fileID=' + fileid + '&changedDate='+cd
				}));
				break;
			case 'dataset':
				//only subscribe when the record is new
				dojo.empty(domNode)

				if(firstTime === true) {
					record.addSubscription(dojo.connect(this.dataset, 'onReceiveItems', dojo.hitch(this, function(items) {
						this.render(record, domNode);
					})))
				}

				var guids = record.data().getReferences(this.dataset.getAssoc());
				if (this.dataset.hasData) {
					dojo.forEach(guids, function(guid) {
						var value = this.dataset.getValue(guid);
						if (value) {
							dojo.place(
								TreeView.widget.Commons.renderLabel(
									value ,
									this.columneditable,
									{ owner: record, guid : guid, dataset: this.columneditdataset, colindex: this.colindex }
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

	_renderAttr : function(record) {
		var object = record.data();
		var attrtype = TreeView.widget.Commons.getAttributeType(object, this.columnattr);
		var value =    TreeView.widget.Commons.getObjectAttr(object, this.columnattr, attrtype != "DateTime");
		if (attrtype == "DateTime") {
			if (!value || "" == value)
				return "";

			return dojo.date.locale.format(new Date(value), {
				selector : 'date',
				datePattern : this.columndateformat != "" ? this.columndateformat : "EEE dd MMM y"
			});
		}
		else if (attrtype == "Boolean" && (this.columntruecaption || this.columnfalsecaption))
			return value == "Yes" ? this.columntruecaption : this.columnfalsecaption;

		return value;
	},

	free : function() {
		dojo.forEach(this.toDestruct, function(item) {
			item.free();
		});
	}
});

dojo.declare("TreeView.widget.Action", null, {
	//Not functional
	actname : '',
	actentity : '',
	actshowbutton : '',
	actclassname : '',
	actbuttoncaption : '',
	actbuttonimage : '',
	actmf : '',
	actmultimf : '',
	actisdefault : false,
	actonselect  : false,
	actnoselectionmf : '',
	actshortcut : '',
	actautohide : '',
	actconfirmtext : '',
	actdataset : '',
	actappliestomultiselection : true,
	actprogressmsg : '',
	//*Not functional

	tree : null,

	constructor : function(args, tree) {
		this.tree = tree;
		dojo.mixin(this, args);

		this.tree.connect(this.tree, 'onSelect', dojo.hitch(this, this.updateToSelection));
	},

	assignRefToSelection : function(item) {
		if (!this.actmf)
			this.configError("No selection microflow defined for association assignment button");

		TreeView.widget.Commons.store(
			//records to objects
			dojo.map(this.tree.getSelection(), function(item) { return item.data() }),

			this.dataset.getAssoc(), item, "add", false,
			//callback
			dojo.hitch(this, function() {
				this.invokeOnSelection();

				this.mxbutton.set('value', null);
			})
		);

	},

	setup : function(parentNode) {
		if (this.actshowbutton) {
			if (this.actdataset) {

				this.dataset = this.tree.dataset[this.actdataset];
				if (this.dataset == null)
					this.tree.configError("Unknown dataset for action: '" + this.actdataset + "'");
				if (!this.actappliestomultiselection)
					this.tree.configError("Reference assignment should be allowed to be applied to multi selections! (see the action allow to multiselection property)");

				this.mxbutton = new TreeView.widget.DropDown({
						onChange : dojo.hitch(this, this.assignRefToSelection),
						sticky   : false,
						label    : this.dataset.rellabel,
						dataset  : this.dataset,
						className : ' gv_action_dropdown ' + this.actclassname
					},
					parentNode,
					null
				)
			}
			else {
				this.mxbutton = new mxui.widget._Button({
					caption     : this.actbuttoncaption,
					icon        : this.actbuttonimage,
					onClick     : dojo.hitch(this, this.invokeOnSelection),
					type        : 'button',
					cssclass    : this.actclassname,
					//title       : column.help, //TODO:?
					isInactive  : false
				});
				dojo.place(this.mxbutton.domNode, parentNode);
			}
		}

		if (this.actonselect)
			this.tree.connect(this.tree, 'onSelect', dojo.hitch(this, this.invokeOnSelection))
	},

	appliesToSelection : function() {
		if (this.actnoselectionmf)
			return true;

		if  (!this.tree.hasSelection() || !this.actmf)
			return false;

		if (this.tree.hasMultiSelection() && !this.actappliestomultiselection)
			return false;

		return this.appliesTo(this.tree.getSelection());
	},

	//Check if this action is applicable to the mentioned item or item list
	appliesTo : function (item) {
		if (!this.actentity)
			return true;

		var applies = true;
		if (dojo.isArray(item)) {
			for(var i = 0; i < item.length; i++)
				applies &= this.appliesTo(item[i]);
			return applies;
		}

		return item.isA(this.actentity);
	},

	//show, hide, enable, disable based on the current selection
	updateToSelection : function() {
		if (this.actshowbutton) {
			var enable = this.appliesToSelection();

			if (!this.mxbutton._destroyed)  {//MWE: wtf?
				this.mxbutton.set("disabled", !enable);
				if (this.actautohide)
					dojo.style(this.mxbutton.domNode, 'display', enable ? 'inline-block' : 'none');
				else
					(enable ? dojo.removeClass : dojo.addClass)(this.mxbutton.domNode, 'gv_button_disabled');
			}
		}
	},

	//invoke, but on the current selection / context, that is, the button is triggered from the header
	invokeOnSelection : function() {
		if (this.appliesToSelection()) {
			var selection = this.tree.getSelection();

			//invoke on the data of the selected node
			if (selection && (this.actmf || this.actmultimf))
				this.invoke(selection);

			//invoke on the root object
			else if (this.actnoselectionmf) {
				TreeView.widget.Commons.confirm(this.actconfirmtext, dojo.hitch(this, function() {
					TreeView.widget.Commons.mf(this.actnoselectionmf, this.tree.getContextObject(), null, this.tree, false, this.actprogressmsg);
				}));
			}
		}
	},

	invoke : function(selection) {
		if ((this.actmf || this.actmultimf) && this.appliesTo(selection)) { //double check applies to, see #15349



			TreeView.widget.Commons.confirm(this.actconfirmtext, dojo.hitch(this, function() {
				//if a new item is added, suggest it as new selection
				delete this._recordSelectionSuggestion;
				this.tree._recordSelectionSuggestion = true;

				//See ticket 9116, we need to invoke the single argument microflow version for a single argument. Multi argument mf will break
				if (dojo.isArray(selection) && selection.length > 1 && this.actmultimf)
					TreeView.widget.Commons.mf(this.actmultimf, dojo.map(selection, function(item) { return item.data() }), null, this.tree, true, this.actprogressmsg);
				else {
					var sel = selection == null || selection == []
						? []
						: dojo.isArray (selection)
							? dojo.map(selection, function(item) { return item.data() })
							: selection.data();

					TreeView.widget.Commons.mf(this.actmf, sel, null, this.tree, false, this.actprogressmsg);
				}
			}));
		}
	},

	free : function() {
		if (this.mxbutton && !this.mxbutton._destroyed)
			this.mxbutton.destroy();
	}

});

dojo.declare("TreeView.widget.RelatedDataset", null, {
	relname             : '',
	rellabel            : '',
	relentity           : '',
	relcontextassoc     : '',
	relitemassocref     : '',
	relitemassocrefset  : '',
	relnameattr         : '',
	relconstraint       : '',
	relnewitemcaption   : '',

	widget : null,
	contextGUID : null,
	hasData : false,

	existingLabels    : null,
	existingLabelsById: null,
	existingOptions   : null,

	_fetchingLabels : false,

	constructor : function(args, widget, cb) {
		this.widget = widget;
		dojo.mixin(this, dojo.data.util.simpleFetch);
		dojo.mixin(this, args);

		this.existingOptions = [];

		this.widget.subscribe({ //fetch the new labels if changed
			entity : this.relentity,
			callback : dojo.hitch(this, this.fetchLabels)
		});

		this.widget.connect(this.widget, "update", dojo.hitch(this, function(data, cb) {
			this.contextGUID = data && data.getGUID ? data.getGUID() : data;
			this.fetchLabels();
			cb && cb();
		}));
	},

	getAssoc : function() {
		return this.relitemassocref != '' ? this.relitemassocref.split("/")[0] : this.relitemassocrefset.split("/")[0];
	},

	isRefSet : function() {
		return this.relitemassocrefset != '';
	},

	getValue : function(item, _) {
			if (typeof (item) == "object")
				return item.getAttribute(this.relnameattr);
			else if (/^\d+$/.test(item)){
				var obj = this.existingLabelsById[item]; //assuming guid
				return obj ? this.getValue(obj) : null; //TODO: warn?
			}
			else
				this.widget.showError("Dataset getValue not valid for: " + item);
			return '';
	},

	getOptions : function() {
		return this.existingOptions;
	},

	fetchLabels : function() {
		if (this.contextGUID  == null || this._fetchingLabels)
			return;

		this.hasData = false;
		this._fetchingLabels = true;
		var xpath = "//" + this.relentity + this.relconstraint + (this.relcontextassoc != '' ? "[" + this.relcontextassoc.split("/")[0] + " = '[%CurrentObject%]']" : '');
		xpath = xpath.replace(/\[\%CurrentObject\%\]/gi, this.contextGUID);
		mx.processor.get({
			xpath : xpath,
			callback : dojo.hitch(this, this.retrieveLabels),
			filter : {
				sort : [ [this.relnameattr, "asc" ] ],
				attributes : [this.relnameattr]
			}
		},this);
	},

	retrieveLabels : function(objects) {
		this.rawObjects = objects;
		this.existingLabels = {};
		this.existingLabelsById = {};

		this.existingOptions = dojo.map(objects, function(obj) {
			var value = obj.getGUID();
			var label = obj.getAttribute(this.relnameattr);

			this.existingLabels[label.toLowerCase()] = obj;
			this.existingLabelsById[value] = obj;

			return { value : value, label : label }
		}, this);

		this._fetchingLabels = false;

		if (this.relnewitemcaption)
			this.existingOptions.splice(0,0, {
				value : 'new',
				label : this.relnewitemcaption,
				onClick : dojo.hitch(this, this.createNewItem)
			}, null) //Null = separator

		this.hasData = true;
		this.onReceiveItems(this.existingOptions);
	},

	onReceiveItems : function(items) {
		//connect stub
	},

	/**
	 * Given a array of guids, returns a list of captions
	 * @param  {[type]} items [description]
	 * @return {[type]}       [description]
	 */
	getCaptions : function(items) {
		return dojo.map(items, this.getValue, this);
	},

	createNewItem : function(callback) {
		var labelname = prompt("Please enter " + this.relnewitemcaption, "");
		if (labelname) {
			mx.processor.create({
				entity : this.relentity,
				error : this.widget.showError,
				callback : dojo.hitch(this, function(label) {
					var cb = callback
						? dojo.hitch(this, callback, {
							value : label.getGUID(),
							label: labelname
						})
						: null;

					if (this.relcontextassoc)
						TreeView.widget.Commons.store(label, this.relcontextassoc, this.contextGUID);

					TreeView.widget.Commons.store(label, this.relnameattr, dojo.trim(labelname), null, true, cb);
				})
			}, this)
		}
	},

	/** dojo store compatibility, useful for future display in selects, filtering selects etc. etc.*/

	/* Identity api */
	getIdentity : function(item) {
		return item.getGUID();
	},

	getIdentityAttributes : function() {
		return null;
	},

	fetchItemByIdentity : function(args) {
		//TODO: check and error handling
		if (!this.existingLabelsById)
			args.onItem.call(args.scope, null);
		else
			args.onItem.call(args.scope, this.existingLabelsById[args.identity]);
	},

	/* Simplefetch api */
	_fetchItems : function(query, resultcallback){
		var results = [];
		if (this.existingLabels != null)
			for(key in this.existingLabels)
				if (key.indexOf(query.query.name.toLowerCase()) == 0)
					results.push(this.existingLabels[key]);

		resultcallback(results, query);
	}

});

dojo.declare("TreeView.widget.SearchControl", null,  {
	dataset : null,

	domNode : null,
	widget  : null,

	searchfilter : "",
	searchlabel  : null,
	realtime : false,
	hasDataset : true,

	_isSearching : false,
	_searchPending : false,

	constructor : function(args, widget) {
		dojo.mixin(this, args);

		this.widget = widget;

		this.setupLayout();
		this.setupSearch();

	},

	setupLayout : function() {
		this.domNode = mxui.dom.div({
			'class' : 'gv_searchBar'
		});

		this.labelContainer = mxui.dom.div({ 'class' : 'gv_searchLabelContainer'});
		dojo.place(this.labelContainer, this.domNode);
	},

	setupSearch : function() {
		//no dataset? setup stub dataset
		if (this.dataset == null) {
			this.hasDataset = false;
			this.dataset = dojo.mixin({
					_fetchItems : dojo.hitch(this, function(query, resultcallback){
						resultcallback([], query);
					}),

					getValue : dojo.hitch(this, function(item, _) {
						return null;
					})
				},
				dojo.data.util.simpleFetch
			);
		}

		this.searchInput = new dijit.form.ComboBox({
			store: this.dataset, //MWE: TODO: works if null?
			queryExpr:"${0}",
			searchAttr:'name',
			searchDelay:0,
			tabIndex:0,
			hasDownArrow:false,
			autoComplete:false,

			onKeyUp : dojo.hitch(this, function(e) {
				if (e.keyCode == dojo.keys.DOWN_ARROW && !this.hasDataset && this.widget.selectFirstItem) { //MWE on arrow down, put focus on grid, but only if no labels are used
					this.widget.selectFirstItem();
					this.widget.grabFocus();
				}
				else if (e.keyCode == dojo.keys.ENTER) {
					if (this.searchInput.item!= null)
						this.setSearchFilter("", this.searchInput.item);
					else {
						this.setSearchFilter(this.searchInput.getValue(), null);
					}
				}
				else if (e.keyCode == dojo.keys.TAB) {
					if (this.searchInput.item!= null) { //do not tab away if tab is used to select an item
						this.setSearchFilter("", this.searchInput.item);
						dojo.stopEvent(e);
					}
				}
				else if (e.keyCode == dojo.keys.SPACE) {
					var name = dojo.trim(this.searchInput.getValue().toLowerCase());
					for(key in this.existingLabels) //check whether first part is an label, recognize it.
						if (name == key) {
							this.setSearchFilter("", this.existingLabels[key]);
							break;
						}
				}
				else if (this.realtime) {
					if  (!this._isSearching)
						this.setSearchFilter(this.searchInput.getValue(), null);
					else
						this._searchPending = true;
				}
			}),

			onChange : dojo.hitch(this, function(e) {
				if (this.searchInput.item != null)  {//only auto search on blur if label selection was made
					this.setSearchFilter("", this.searchInput.item);
				}
			})
		});

		this.searchInput.loadDropDown();
		dojo.addClass(this.searchInput.dropDown.domNode, 'gv_search_labeldropdownmenu');

		var tb = this.searchInput.textbox;
		var self = this;

		tb.value = this.searchplaceholder;
		dojo.addClass(tb, 'tg_search_placeholder');

		this.widget.connect(tb, 'onfocus', function() {
			if (self.searchplaceholder == tb.value)
					tb.value = '';
			dojo.removeClass(tb, 'tg_search_placeholder');
		});

		this.widget.connect(tb, 'onblur', function() {
			if ('' == tb.value && self.searchlabel == null) {
				tb.value = self.searchplaceholder;
				dojo.addClass(tb, 'tg_search_placeholder');
			}
		});

		dojo.place(this.searchInput.domNode, this.domNode);

		//this.connect(this.searchSubmit, 'onclick', dojo.hitch(this, this.performSearch));
		// this.connect(this.searchReset, 'onclick', dojo.hitch(this, this.resetAndFetchAll));
		this.widget.connect(this.labelContainer, 'onclick', dojo.hitch(this, function(evt) {
			if (dojo.hasClass(evt.target, 'gv_label_close'))
				this.setSearchFilter(this.searchInput.getValue(), null);//remove the label selection
		}));


	},

	updateSearchLabel : function(label) {
		dojo.empty(this.labelContainer);
		if (label != null) {
			var labelname = label.getAttribute(this.dataset.relnameattr);
			dojo.place(TreeView.widget.Commons.renderLabel(labelname, true), this.labelContainer);
		}
	},

	setSearchFilter :function(searchfilter, searchlabel) {
		if (this.searchfilter != searchfilter || this.searchlabel != searchlabel) {
			this._isSearching = true;
			this.searchfilter =  searchfilter;
			this.searchlabel = searchlabel;

//			this.searchInput.set("value", searchfilter);
			this.updateSearchLabel(searchlabel);

			this.widget.curpage = 0;
			this.widget.fetchAll(dojo.hitch(this, function() {
				this._isSearching = false;

				//There were one ore more searches triggered while we were searching..
				if (this._searchPending) {
					this._searchPending = false;
					this.setSearchFilter(this.searchInput.getValue(), null);//TODO: how does this relate to this.searchInput.item?
				}
			}));
		}

	},

	getSearchConstraints : function(searchAttrs, limit) {
		//search for term xpath
		var xpath = "";

		if (!searchAttrs.length)
			this.widget.configError("No search attributes defined!");

		if (this.searchfilter) {
			var filtervalues = dojo.map(this.searchfilter.split(/\s+/), mxui.html.escapeQuotes);

			if (typeof limit !== 'undefined' && filtervalues.length > limit) {
				filtervalues.splice(limit, filtervalues.length - limit);
			}
			
			//we want every search value to occur at least once! In one of the attributes
			xpath += "[(" + dojo.map(filtervalues, function(fv) {
					return dojo.map(searchAttrs, function(attr) {
						return "contains(" + attr + ",'" + fv + "')";
					}).join(" or ");
				}, this).join (") and (") + ")]";
		}

		if (this.searchlabel != null)
			xpath += "["  + this.dataset.getAssoc() + " = '"  + this.searchlabel.getGUID() + "']";

		return xpath;
	},

	free : function() {
		this.searchInput && this.searchInput.destroy();
	}

});

dojo.declare("TreeView.widget.FilterManager", null, {
	widget: null,
	domNode : null,
	filters : null,

	constructor : function(widget) {
		this.widget   = widget;
		this.filters  = [];

		this.menu = new dijit.Menu({
			style: "display: none;"
		});

		this.dropdown = new dijit.form.DropDownButton({
			label : "Filter",
			dropDown : this.menu
		});

		dojo.addClass(this.dropdown.dropDown.domNode, 'gv_filter_dropdown_menu');

		this.domNode = this.dropdown.domNode;
		dojo.addClass(this.domNode, 'gv_filter_dropdown');
	},

	getSearchConstraints : function() {
		var cs = dojo.map(this.filters, function(filter) {
			return filter.getSearchConstraints().join(" or ");
		}).join(" ][ ");
		return cs.length > 0 ? "[" + cs + "]" : "";
	},

	addFilter : function(filter) {
		if (this.filters.length > 0)
			this.menu.addChild(new dijit.MenuSeparator());

		this.filters.push(filter);
		dojo.forEach(filter.getMenuItems(), function(item) {
			this.menu.addChild(item);
		}, this);
	},

	free : function() {
		dojo.forEach(this.filters, function(filter) {
			filter.free();
		});

		this.dropdown.destroy();
	},

	applyFilters : function() {
		this.widget.curpage = 0;
		this.widget.fetchAll();
	}
});

dojo.declare("TreeView.widget.Filter", null, {
	fm : null,
	filterattr : null,
	filtertruecaption : null,
	filterfalsecaption : null,
	filterbooleandefault : null,

	isEnum : false,
	trueitem : null,
	falseitem : null,
	enumStateMap : null,
	enumItems : null,

	itemClick : function() {
		this.fm.applyFilters();
	},

	constructor : function(args, fm) {
		this.fm = fm;
		dojo.mixin(this, args);

		this.isEnum = TreeView.widget.Commons.getAttributeType(fm.widget.entity, this.filterattr) == "Enum";

		//setup enum menu items
		if (this.isEnum) {
			this.enumStateMap = {};

			this.enumItems = dojo.map(
				TreeView.widget.Commons.getEnumMap(fm.widget.entity, this.filterattr),
				function(enumItem) {

					var mi = new dijit.CheckedMenuItem({
						label   : enumItem.caption,
						checked : true,
						onClick : dojo.hitch(this, this.itemClick)
					});

					this.enumStateMap[enumItem.key] = mi;
					return mi;
			}, this);

		}

		//setup boolean menu items
		else {
			if (this.filtertruecaption)
				this.trueitem = new dijit.CheckedMenuItem({
					label   : this.filtertruecaption,
					checked : "all" == this.filterbooleandefault || true == this.filterbooleandefault,
					onClick : dojo.hitch(this, this.itemClick)
				});

			if (this.filterfalsecaption)
				this.falseitem = new dijit.CheckedMenuItem({
					label   : this.filterfalsecaption,
					checked : "all" == this.filterbooleandefault || false == this.filterbooleandefault,
					onClick : dojo.hitch(this, this.itemClick)
				});
		}

		this.fm.addFilter(this);
	},

	getMenuItems : function() {
		if (this.isEnum)
			return this.enumItems;

		else {
			var res = [];
			if (this.trueitem)
				res.push(this.trueitem);
			if (this.falseitem)
				res.push(this.falseitem);
			return res;
		}
	},

	getSearchConstraints : function() {
		var res = [];

		//enum?
		if (this.isEnum) {
			for(var key in this.enumStateMap)
				if (this.enumStateMap[key].get("checked") === true)
					res.push(this.filterattr + " = '" + key + "'");
		}

		//boolean?
		else {
			if (this.trueitem && this.trueitem .get("checked") === true)
				res.push (this.filterattr + " =  true() ");
			if (this.falseitem && this.falseitem.get("checked") === true)
				res.push (this.filterattr + " =  false()");

			//only one value is defined to filter? Then the other is always true
			if (this.falseitem ^ this.trueitem)
				res.push(this.filterattr + " = " + (this.falseitem ? "true()" : "false()"));
		}

		if (res.length == 0) //filter all out
			res.push(this.isEnum ? this.filterattr + " = NULL" : this.filterattr + " = true() and " + this.filterattr + " = false()");

		return res;
	},

	free : function() {

	}
});
