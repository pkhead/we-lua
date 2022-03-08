Lua.onready(function() {
    window.globalLua = Lua.createState();

    // remove io library
    Lua.pushNil(globalLua);
    Lua.setGlobal(globalLua, "io");

    // set debug.breakpoint to start JS debugger
    Lua.pushGlobal(globalLua, "debug");
    Lua.pushString(globalLua, "breakpoint");
    Lua.pushFunction(globalLua, L => {
        debugger;
        return 0;
    });
    Lua.setTable(globalLua, -3);
    Lua.pop(globalLua, 1);
});

// define WickObject struct
(function() {
    var uuidLen = uuidv4().length;
    Lua.defineUserdata("WickObject", {
        uuid: `string${uuidLen}`,
        ref: "int"
    });
})();

// maps objects to lua userdatas
var luaWrappers = new Map();

// JS functions to handle lua metamethod inheritance (e.g. __index, __newindex)
var luaClassHandlers = {};
var luaClassMetafields = {};
var luaClassSupers = {};

/**
 * Utility function to copy a Lua table from the state
 * @param {integer} L The target Lua state 
 * @param {integer} index The index of the table to copy 
 */

// too lazy to figure it out
// https://stackoverflow.com/questions/4535152/cloning-a-lua-table-in-lua-c-api
function luaCopyTable(L, i) {
    Lua.createTable(L);
    // orig_table table

    Lua.pushNil(L);
    // orig_table table nil

    while (Lua.next(L, i - 2)) {
        // orig_table table key value
        Lua.pushFromStack(L, -2);
        // orig_table table key value key

        Lua.insert(L, -2);
        // orig_table table key key value
        Lua.setTable(L, -4);
        // orig_table table key
    }

    // orig_table table
}

/**
 * Gets/creates a userdata wrapper for a Wick object
 * @param {Lua.State} L The Lua.State
 * @param {Wick.Base} obj The Wick object to wrap. A null or undefined will push nil. 
 * @returns The Lua.Userdata wrapper
 */
function luaWrapObject(L, obj) {
    if (!obj) {
        Lua.pushNil(L);
        return null;
    } else {
        /*var ud = luaWrappers.get(obj);

        if (ud) {
            //Lua.pushRef(L, ud.ref);
            return ud;
        }*/

        var ud = Lua.createUserdata(L, "WickObject");
        ud.uuid = obj.uuid;

        //Lua.pushFromStack(L, -1);
        //ud.ref = Lua.ref(L);

        Lua.pushMetatable(L, obj._classname);
        Lua.setMetatable(L, -2);

        //luaWrappers.set(obj, ud);

        return ud;
    }
}

/**
 * Unregisters an object wrapper. Call this when the userdata is garbage collected.
 * @param {Lua.State} L The Lua.State
 * @param {Wick.Base} obj The Wick object that is wrapped 
 */
/*
function luaDeleteWrapper(L, ud) {
    var obj = window.project.getObjectByUUID(ud.uuid);
    luaWrappers.delete(obj);
}
*/

function luaMetafield(L, i, k) {
    Lua.getMetatable(L, i);
    Lua.pushString(L, k);
    Lua.getTable(L, -2);
}

function luaIsA(L, i, targetClass) {
    if (Lua.getType(L, i) !== Lua.TUSERDATA) return false;
    if (Lua.getMetatable(L, i) === 0) return false;

    Lua.pushString(L, "__name");
    Lua.getTable(L, -2);

    var className = Lua.getString(L, -1);

    Lua.pop(L, 2);

    while (className !== targetClass) {
        className = luaClassSupers[className];
        if (!className) return false;
    }

    return true;
}

/**
 * Gets the Wick object associated with a Lua userdata
 * @param {Lua.State} L The Lua.State
 * @param {string} classname The required class
 * @returns The Wick object, null if class check was not successful
 */
function luaGetObject(L, i, classname) {
    if (!luaIsA(L, i, classname)) {
        Lua.throwTypeError(L, i, classname);
        return null;
    }

    var self = Lua.getUserdata(L, i, "WickObject");

    if (!self) {
        Lua.throwError(L, "unknown exception");
        return null;
    }

    return window.project.getObjectByUUID(self.uuid);
}

/**
 * Utility function to convert JS Object to Lua table, and put it on stack
 * @param {Lua.State} L The Lua.State
 * @param {object} source The JS object to convert
 */
function luaToTable(L, source) {
    if (!source) {
        Lua.pushNil(L);
        return;
    }

    Lua.createTable(L);

    for (let k in source) {
        let v = source[k];

        Lua.pushString(L, k.toString());

        if (v instanceof Wick.Base) {
            luaWrapObject(L, v);
        } else {
            switch(typeof v) {
                case "number":
                    Lua.pushNumber(L, v);
                    break;
                case "string":
                    Lua.pushString(L, v);
                    break;
                case "boolean":
                    Lua.pushBoolean(L, v);
                    break;
                case "object":
                    console.warn("Converting unknown object type");
                    luaToTable(L, v);
                    break;
            }
        }

        Lua.setTable(L, -3);
    }
}

/**
 * Utility function to convert Lua table to JS object
 * @param {integer} L The target Lua.State 
 * @param {integer} index The index of the source table
 */
function luaFromTable(L, index) {
    var res = {};

    Lua.pushNil(L);

    while (Lua.next(L, index - 1)) {
        var key = Lua.getString(L, -2);
        var type = Lua.getType(L, -1);
        var val;

        switch(type) {
            case Lua.TNIL:
                val = null;
                break;
            case Lua.TBOOLEAN:
                val = Lua.getBoolean(L, -1);
                break;
            case Lua.TLIGHTUSERDATA:
                throw new Lua.Error("Undefined behavior: Attempting to read a light userdata");
            case Lua.TNUMBER:
                val = Lua.getNumber(L, -1);
                break;
            case Lua.TSTRING:
                val = Lua.getString(L, -1);
                break;
            case Lua.TTABLE:
                val = luaFromTable(L, -1);
                break;
            case Lua.TFUNCTION:
                Lua.throwError(L, "unexpected type \"function\" in table");
                break;
            case Lua.TUSERDATA:
                Lua.throwError(L, "unexpected type \"userdata\" in table");
                break;
            case Lua.TTHREAD:
                throw new Lua.Error("Undefined behavior: Attempting to read a thread");
        }

        res[key] = val;

        Lua.pop(L, 1);
    }

    return res;
}

/**
 * Utility function to create a Lua metatable for a class.
 * In the fields parameters, getters have the keys "__get__" followed by the property name,
 * setters have the same but with "__set__" instead. Anything else that doesn't have
 * beginning underscores is the definition for a Lua metamethod.
 * It leaves the newly created metatable on the stack
 * @param {Lua.State} L The Lua.State 
 * @param {string} superName The class to inherit, leave as "null" if not inheriting 
 * @param {string} className The class name 
 * @param {object} fields The list of setters, getters, and metamethods
 */
function luaCreateClass(L, superName, className, fields) {
    Lua.createMetatable(L, className);
    luaClassSupers[className] = superName;

    var handlers = {};

    var funcs = {};

    // get keys that start with "__func__" and create a lua function for them
    for (let k in fields) {
        if (k.slice(0, 8) === "__func__") {
            let fname = k.slice(8);
            let v = fields[k];

            Lua.pushFunction(L, v);
            funcs[k] = Lua.ref(L);
        }
    }
    
    // if class is inherited and setter/getter is not defined
    // it will call the setter/getter for the super class
    // otherwise it will throw an error
    if (superName) {
        let superHandlers = luaClassHandlers[superName]; 

        handlers.index = (L, index) => {
            if (("__func__" + index) in funcs) {
                Lua.pushRef(L, funcs["__func__" + index]);
                return 1;
            } else if (("__get__" + index) in fields) {
                let item = luaGetObject(L, 1, className);
                if (!item) return 0;
                return fields["__get__" + index].call(item, L);
            } else {
                return superHandlers.index(L, index);
            }
        };

        handlers.newindex = (L, index) => {
            if (index in fields) {
                let item = luaGetObject(L, 1, className);
                if (!item) return 0;
                fields[index].call(item, L);
            } else {
                superHandlers.newindex(L, index);
            }

            return 0;
        };
    } else {
        handlers.index = (L, index) => {
            if (("__func__" + index) in funcs) {
                Lua.pushRef(L, funcs["__func__" + index]);
                return 1;
            } else if (("__get__" + index) in fields) {
                let item = luaGetObject(L, 1, className);
                if (!item) return 0;
                return fields["__get__" + index].call(item, L);
            } else {
                Lua.throwError(L, `attempt to access nil field "${index}"`);
                return 0;
            }
        };

        handlers.newindex = (L, index) => {
            if (index in fields) {
                let item = luaGetObject(L, 1, className);
                if (!item) return 0;
                fields[index].call(item, L);
            } else {
                Lua.throwError(L, `attempt to access nil field ${index}`);
            }

            return 0;
        };
    }

    luaClassHandlers[className] = handlers;

    // wrap the index handler to the lua metatable
    Lua.pushString(L, "__index");
    Lua.pushFunction(L, L => {
        var index = Lua.getString(L, 2);
        
        return handlers.index(L, index);
    });
    Lua.setTable(L, -3);

    // wrap the newindex handler to the lua metatable
    Lua.pushString(L, "__newindex");
    Lua.pushFunction(L, L => {
        var index = Lua.getString(L, 2);

        handlers.newindex(L, "__set__" + index);
        return 0;
    });
    Lua.setTable(L, -3);

    // add the rest of the fields into the metatable
    // setters/getters are differentiated from metamethods
    // by the lack of beginning underscores in the fields variable
    // (the underscores will be added into the metatable)
    var metafields = {};
    var set = new Set();

    for (let k in fields) {
        if (k[0] !== "_") {
            Lua.pushString(L, "__" + k);
            Lua.pushFunction(L, fields[k]);
            Lua.pushFromStack(L, -1);
            metafields[k] = Lua.ref(L);
            set.add(k);
            console.log("metafield");
            Lua.stackDump(L);
            Lua.setTable(L, -3);
        }
    }

    luaClassMetafields[className] = metafields;
    
    // insert the fields of inherting classes into the metatable
    if (superName) {
        let fieldName = superName;

        while (fieldName) {
            fieldSrc = luaClassMetafields[fieldName];

            for (let k in fieldSrc) {
                let v = fieldSrc[k];

                if (!set.has(k)) {
                    Lua.pushString(L, "__" + k);
                    Lua.pushRef(L, v);
                    Lua.setTable(L, -3);

                    set.add(k);
                }
            }

            fieldName = luaClassSupers[fieldName];
        }
    }
}