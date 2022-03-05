Lua.onready(function() {
    window.globalLua = new Lua.State();
});

// maps lua userdatas to object 
var luaUserdata = new Map();

// maps objects to lua userdatas
var luaWrappers = new Map();

// JS functions to handle lua metamethod inheritance (e.g. __index, __newindex)
var luaClassHandlers = {};
var luaClassMetafields = {};
var luaClassSupers = {};

/**
 * Gets/creates a userdata wrapper for a Wick object
 * @param {Lua.State} L The Lua.State
 * @param {Wick.Base} obj The Wick object to wrap. A null or undefined will push nil. 
 * @returns The Lua.Userdata wrapper
 */
function luaWrapObject(L, obj) {
    if (!obj) {
        L.pushNil();
        return null;
    } else {
        var ud = L.createUserdata({
            uuid: `string${obj.uuid.length}`
        });
        ud.uuid = obj.uuid;

        L.pushMetatable(obj._classname);
        L.setMetatable(-2);

        return ud;
    }
}

function luaMetafield(L, i, k) {
    L.getMetatable(i);
    L.pushString(k);
    L.getTable(-2);
}

function luaIsA(L, i, targetClass) {
    if (L.getMetatable(i) === 0) return false;

    L.pushString("__name");
    L.getTable(-2);

    var className = L.getString(-1);

    L.pop(2);

    while (className === targetClass) {
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
        L.throwTypeError(i, classname);
        return null;
    }

    var self = L.getUserdata(1);

    if (!self) {
        L.throwError("unknown exception");
        return null;
    }

    return window.project.getObjectByUUID(self.uuid);
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
    L.createMetatable(className);
    luaClassSupers[className] = superName;

    var handlers = {};

    var funcs = {};

    // get keys that start with "__func__" and create a lua function for them
    for (let k in fields) {
        if (k.slice(0, 8) === "__func__") {
            let fname = k.slice(8);
            let v = fields[k];

            L.pushFunction(v);
            funcs[k] = L.ref();
        }
    }
    
    // if class is inherited and setter/getter is not defined
    // it will call the setter/getter for the super class
    // otherwise it will throw an error
    if (superName) {
        let superHandlers = luaClassHandlers[superName]; 

        handlers.index = (L, item, index) => {
            if (funcs[index]) {
                L.pushRef(funcs[index]);
                return 1;
            } else if (fields[index]) {
                return fields[index].call(item, L);
            } else {
                superHandlers.index(L, item);
            }
        };

        handlers.newindex = (L, item, index) => {
            if (fields[index]) {
                fields[index].call(item, L);
            } else {
                superHandlers.newindex(L, item);
            }

            return 0;
        };
    } else {
        handlers.index = (L, item, index) => {
            if (funcs[index]) {
                L.pushRef(funcs[index]);
                return 1;
            } else if (fields[index]) {
                return fields[index].call(item, L);
            } else {
                L.throwError(`attempt to access nil field "${index}"`);
                return 0;
            }
        };

        handlers.newindex = (L, item, index) => {
            if (fields[index]) {
                fields[index].call(item, L);
            } else {
                L.throwError(`attempt to access nil field ${index}`);
            }

            return 0;
        };
    }

    luaClassHandlers[className] = handlers;

    // wrap the index handler to the lua metatable
    L.pushString("__index");
    L.pushFunction(L => {
        var item = luaGetObject(L, 1, className);
        if (!item) return 0;
        var index = L.getString(2);
        
        return handlers.index(L, item, index);
    });
    L.setTable(-3);

    // wrap the newindex handler to the lua metatable
    L.pushString("__newindex");
    L.pushFunction(L => {
        var item = luaGetObject(L, 1, className);
        if (!item) return 0;
        var index = L.getString(2);

        handlers.newindex(L, item, "__set__" + index);
        return 0;
    });

    // add the rest of the fields into the metatable
    // setters/getters are differentiated from metamethods
    // by the lack of beginning underscores in the fields variable
    // (the underscores will be added into the metatable)
    var metafields = {};
    var set = new Set();

    for (let k in fields) {
        if (k[0] !== "_") {
            L.pushString("__" + k);
            L.pushFunction(fields[k]);
            L.pushFromStack(-1);
            metafields[k] = L.ref();
            set.add(k);
            L.setTable(-3);
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
                    L.pushString("__" + k);
                    L.pushRef(v);
                    L.setTable(-3);

                    set.add(k);
                }
            }

            fieldName = luaClassSupers[fieldName];
        }
    }
}