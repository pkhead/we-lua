Lua.onready(function() {
    window.globalLua = new Lua.State();
});

// maps lua userdatas to object 
var luaUserdata = new Map();

// maps objects to lua userdatas
var luaWrappers = new Map();

function luaMetafield(L, i, k) {
    L.getMetatable(i);
    L.pushString(k);
    L.getTable(-2);
}

function luaCreateClass(L, className, obj) {
    L.createPrototype(className, obj);
}

function luaExtendClass(L, superName, className, obj) {
    L.createPrototype(className, obj);

    L.pushMetatable(superName);
    L.setMetatable(-2);
}

function luaIsA(L, i, className) {
    /*
    function luaIsA(obj, className)
        local mt = getmetatable(obj)
        if mt == nil then
            return false
        end

        if mt.__name == className then
            return true
        else
            return luaIsA(mt, className)
        end
    end
    */
   
    if (L.getMetatable(i) === 0) {
        return false;
    }
    
    L.pushString("__name");
    L.getTable(-2);

    // stack = userdata, metatable, __name
	
    if (L.getString(-1) === className) {
		L.pop(2);
        return true;
    } else {;
		L.pop(1);
        var res = luaIsA(L, -1, className);
		L.pop(1);
        return res;
    }
}