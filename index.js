var Service, Characteristic;
var request = require("request");
var http = require("http");
var pollingtoevent = require('polling-to-event');

module.exports = function(homebridge)
{
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-control4", "Control4", HttpAccessory);
}

function HttpAccessory(log, config)
{
    this.log = log;
    
    // url info
    this.service                = config["service"] || "Switch";
    this.base_url               = config["base_url"];
    this.enable_status          = config["has_on_state"] || "yes"
    this.enable_power_control   = config["has_power_control"] || "yes";
    this.enable_level           = config["has_level_control"] || "no";
    this.invert_contact         = config["invert_contact"] || "no";
    this.include_video          = config["include_video"] || "yes";
    
    if( this.service == "Security" || this.service == "Motion" || this.service == "Doorbell" )
        this.enable_power_control = "no";
    
    if( this.enable_power_control == "yes" )
    {
        if( this.service == "Garage Door" )
        {
            this.on_url               = this.base_url + "/close";
            this.on_body              = config["open_body"];
            this.off_url              = this.base_url + "/open";
            this.off_body             = config["close_body"];
        }
        else if( this.service == "Lock" )
        {
            this.on_url               = this.base_url + "/lock";
            this.on_body              = config["open_body"];
            this.off_url              = this.base_url + "/unlock";
            this.off_body             = config["close_body"];
        }
        else
        {
            this.on_url                 = this.base_url + "/on";
            this.on_body                = config["on_body"];
            this.off_url                = this.base_url + "/off";
            this.off_body               = config["off_body"];
        }
    }
    
    if( this.service == "Thermostat" )
    {
        this.set_mode_url          = this.base_url + "/set_hvac_mode/%m";
        this.get_mode_url          = this.base_url + "/hvac_mode";
        this.get_status_url        = this.base_url + "/hvac_status";
        this.set_target_heat_url   = this.base_url + "/set_heat_setpoint/%c";
        this.set_target_cool_url   = this.base_url + "/set_cool_setpoint/%c";
        this.get_target_heat_url   = this.base_url + "/heat_setpoint";
        this.get_target_cool_url   = this.base_url + "/cool_setpoint";
        this.get_temperature_url   = this.base_url + "/temperature";
        
        this.cool_string = config["cool_string"] || "Cool";
        this.heat_string = config["heat_string"] || "Heat";
        this.off_string = config["off_string"] || "Off";
        this.auto_string = config["auto_string"] || "Auto";
    }
    
    var that = this;
    
    const requestHandler = (request, response) => {
        //console.log(request.url)
        
        var parts = request.url.split("/")
        var prop = parts[1]
        var value = parts[2]
        
        //console.log("Received update to property("+prop+") with value("+value+")")
        
        if( prop == 1000 )
        {
            var binaryState = parseInt(value.replace(/\D/g,""));
            that.state = binaryState > 0;
            that.log(that.service, "received power",that.status_url, "state is currently", binaryState);
            
            // switch used to easily add additonal services
            that.enableSet = false;
            switch (that.service) {
                case "Switch":
                    if (that.switchService ) {
                        that.switchService .getCharacteristic(Characteristic.On)
                        .setValue(that.state);
                    }
                    break;
                case "Light":
                case "Dimmer":
                    if (that.lightbulbService) {
                        that.lightbulbService.getCharacteristic(Characteristic.On)
                        .setValue(that.state);
                    }
                    break;
                case "Door":
                    if (that.doorService) {
                        that.doorService.getCharacteristic(Characteristic.CurrentPosition)
                        .setValue(that.state?0:100);
                        that.doorService.getCharacteristic(Characteristic.TargetPosition)
                        .setValue(that.state?0:100);
                        that.doorService.getCharacteristic(Characteristic.PositionState)
                        .setValue(2);
                    }
                    break;
                case "Window":
                    if (that.windowService) {
                        that.windowService.getCharacteristic(Characteristic.CurrentPosition)
                        .setValue(that.state?0:100);
                        that.windowService.getCharacteristic(Characteristic.TargetPosition)
                        .setValue(that.state?0:100);
                        that.windowService.getCharacteristic(Characteristic.PositionState)
                        .setValue(2);
                    }
                    break;
                case "Garage Door":
                    if( that.garageService ) {
                        that.garageService.getCharacteristic(Characteristic.CurrentDoorState)
                        .setValue(that.state?Characteristic.CurrentDoorState.CLOSED:Characteristic.CurrentDoorState.OPEN);
                        that.garageService.getCharacteristic(Characteristic.TargetDoorState)
                        .setValue(that.state?Characteristic.TargetDoorState.CLOSED:Characteristic.TargetDoorState.OPEN);
                    }
                    break;
                case "Lock":
                    if( that.lockService ) {
                        that.lockService.getCharacteristic(Characteristic.LockCurrentState)
                        .setValue(!that.state?Characteristic.LockCurrentState.SECURED:Characteristic.LockCurrentState.UNSECURED);
                        that.lockService.getCharacteristic(Characteristic.LockTargetState)
                        .setValue(!that.state?Characteristic.LockTargetState.SECURED:Characteristic.LockTargetState.UNSECURED);
                    }
                    break;
                case "Contact":
                    if( that.contactService ) {
                        that.contactService.getCharacteristic(Characteristic.ContactSensorState)
                        .setValue(that.state?Characteristic.ContactSensorState.CONTACT_DETECTED:Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
                    }
                    break;
                case "Doorbell":
                    if( that.doorbellService ) {
                        var toCheck = true;
                        if( that.invert_contact == "yes" ) {
                            toCheck = false;
                        }
                        if( that.state == toCheck && that.state != that.lastState ) {
                            that.lastSent = !that.lastSent;
                            
                            that.doorbellService.getCharacteristic(Characteristic.ProgrammableSwitchEvent)
                            .setValue(that.lastSent?1:0);
                        }
                        that.lastState = that.state;
                    }
                    break;
                case "Motion":
                    if( that.motionService ) {
                        that.motionService.getCharacteristic(Characteristic.MotionDetected).setValue(!that.state);
                    }
                    break;
                case "Fan":
                    if( that.fanService ) {
                        that.fanService.getCharacteristic(Characteristic.On).
                        setValue(that.state);
                    }
                    break;
                case "Security":
                    that.httpRequest(that.status_url, "", "GET", that.username, that.password, that.sendimmediately, function(error, response, body)
                                     {
                                     if (error)
                                     {
                                     that.log('HTTP get power function failed: %s', error.message);
                                     return;
                                     }
                                     else
                                     {
                                     var binaryState = parseInt(body.replace(/\D/g,""));
                                     that.state = binaryState > 0;
                                     if( that.securityService && binaryState < 10 )
                                     {
                                     if( binaryState < 5 ) {
                                     that.secCurState = binaryState;
                                     that.secTarState = binaryState;
                                     } else {
                                     that.secTarState = 0;
                                     }
                                     that.securityService.getCharacteristic(Characteristic.SecuritySystemCurrentState).
                                     setValue(that.secCurState);
                                     that.securityService.getCharacteristic(Characteristic.SecuritySystemTargetState).
                                     setValue(that.secTarState);
                                     }
                                     }
                                     });
                    break;
            }
            that.enableSet = true;
        }
        else if( prop == 1001 )
        {
            that.currentlevel = parseInt(value);
            
            that.enableSet = false;
            switch (that.service) {
                case "Light":
                case "Dimmer":
                    if (that.lightbulbService) {
                        that.log(that.service, "received brightness",that.brightnesslvl_url, "level is currently", that.currentlevel);
                        that.lightbulbService.getCharacteristic(Characteristic.Brightness)
                        .setValue(that.currentlevel);
                    }
                    break;
                case "Fan":
                    if( that.fanService ) {
                        that.log(that.service, "received fan level",that.brightnesslvl_url, "level is currently", that.currentlevel);
                        that.fanService.getCharacteristic(Characteristic.RotationSpeed)
                        .setValue(that.currentlevel*25);
                    }
                    break;
                case "Security":
                    that.httpRequest(that.status_url, "", "GET", that.username, that.password, that.sendimmediately, function(error, response, body) {
                                     if (error) {
                                     that.log('HTTP get power function failed: %s', error.message);
                                     return;
                                     } else {
                                     var binaryState = parseInt(body.replace(/\D/g,""));
                                     that.state = binaryState > 0;
                                     if( that.securityService && binaryState < 10 ) {
                                     if( binaryState < 5 ) {
                                     that.secCurState = binaryState;
                                     that.secTarState = binaryState;
                                     } else {
                                     that.secTarState = 0;
                                     }
                                     that.securityService.getCharacteristic(Characteristic.SecuritySystemCurrentState).
                                     setValue(that.secCurState);
                                     that.securityService.getCharacteristic(Characteristic.SecuritySystemTargetState).
                                     setValue(that.secTarState);
                                     }
                                     }});
                    break;
            }
            that.enableSet = true;
        }
        else if( prop == 1107 ) // HVAC Status
        {
            var state = Characteristic.TargetHeatingCoolingState.OFF;
            if( value.includes(that.cool_string) )
            {   
                state = Characteristic.TargetHeatingCoolingState.COOL;
            }
            else if( value.includes(that.heat_string) )
            {   
                state = Characteristic.TargetHeatingCoolingState.HEAT;
            }
            else if( value.includes(that.auto_string) )
            {   
                state = Characteristic.TargetHeatingCoolingState.AUTO;
            }
            that.thermStatus = state;

            that.log(that.service, "received hvac status",that.get_status_url, "hvac status is currently", value);
   
            that.thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).setValue(state);   
        }
        else if( prop == 1104 ) // HVAC Mode
        {
            that.enableSetTemp = false;
            that.enableSetState = false;
            var state = Characteristic.TargetHeatingCoolingState.OFF;
            if( value == that.cool_string )
            {
                state = Characteristic.TargetHeatingCoolingState.COOL;
            }
            else if( value == that.heat_string )
            {
                state = Characteristic.TargetHeatingCoolingState.HEAT;
            }
            else if( value == that.auto_string )
            {
                state = Characteristic.TargetHeatingCoolingState.AUTO;
            }
            that.thermLastState = state;
            
            that.log(that.service, "received hvac state",that.get_mode_url, "hvac mode is currently", value);
            if( !that.thermTarStateSet )
            {
                that.thermTarStateSet = true;
                that.thermTarState = state;
                that.thermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState).setValue(that.thermTarState);
            }
            
            if( that.thermLastState == Characteristic.TargetHeatingCoolingState.AUTO)
            {
                //Need to adjust the state here because HomeKit doesn't allow a current state of auto.
                if( that.thermCurrentTemp != -100 && that.thermCoolSet != -100 && that.thermHeatSet != -100 )
                {
                    var coolDiff = that.thermCurrentTemp - that.thermCoolSet;
                    if( coolDiff < 0 )
                        coolDiff = coolDiff*-1;
                    
                    var heatDiff = that.thermCurrentTemp - that.thermHeatSet;
                    if( heatDiff < 0 )
                        heatDiff = heatDiff*-1;
                    
                    if( coolDiff < heatDiff )
                        state = Characteristic.TargetHeatingCoolingState.COOL;
                    else
                        state = Characteristic.TargetHeatingCoolingState.HEAT;
                }
                else
                {
                    state = Characteristic.TargetHeatingCoolingState.OFF;
                }
            }
            
            that.thermCurState = state;
            
            if( that.thermCurState == Characteristic.TargetHeatingCoolingState.COOL && that.thermCoolSet != -100 )
            {
                that.thermostatService.getCharacteristic(Characteristic.TargetTemperature).setValue(that.thermCoolSet);
            }
            if( that.thermCurState == Characteristic.TargetHeatingCoolingState.HEAT && that.thermHeatSet != -100 )
            {
                that.thermostatService.getCharacteristic(Characteristic.TargetTemperature).setValue(that.thermHeatSet);
            }
            that.enableSetTemp = true;
            that.enableSetState = true;
        }
        else if( prop == 1131 ) // Temp
        {
            if( that.thermostatService )
            {
                that.log(that.service, "received current temperature",that.get_temperature_url, "temperature is currently", value);
                that.thermostatService.getCharacteristic(Characteristic.CurrentTemperature).setValue(parseFloat(value));
                that.thermCurrentTemp = parseFloat(value);
            }
        }
        else if( prop == 1133 ) // Heat setpoint
        {
            that.enableSetTemp = false;
            that.enableSetState = false;

            if( that.thermostatService )
            {
                that.log(that.service, "received current heat setpoint",that.set_target_heat_url, "heat setpoint is currently", value);
                that.thermHeatSet = parseFloat(value);
                
                if( that.thermLastState == Characteristic.TargetHeatingCoolingState.AUTO)
                {
                    //Need to adjust the state here because HomeKit doesn't allow a current state of auto.
                    if( that.thermCurrentTemp != -100 && that.thermCoolSet != -100 && that.thermHeatSet != -100 )
                    {
                        var coolDiff = that.thermCurrentTemp - that.thermCoolSet;
                        if( coolDiff < 0 )
                            coolDiff = coolDiff*-1;
                        
                        var heatDiff = that.thermCurrentTemp - that.thermHeatSet;
                        if( heatDiff < 0 )
                            heatDiff = heatDiff*-1;
                        
                        if( coolDiff < heatDiff )
                            state = Characteristic.TargetHeatingCoolingState.COOL;
                        else
                            state = Characteristic.TargetHeatingCoolingState.HEAT;
                    }
                    else
                    {
                        state = Characteristic.TargetHeatingCoolingState.OFF;
                    }
                    that.thermCurState = state;
                }
                
                if( that.thermCurState == Characteristic.TargetHeatingCoolingState.HEAT )
                {
                    that.thermostatService.getCharacteristic(Characteristic.TargetTemperature).setValue(that.thermHeatSet);
                }
            }
            that.enableSetTemp = true;
            that.enableSetState = true;
        }
        else if( prop == 1135 ) // Cool setpoint
        {
            that.enableSetTemp = false;
            that.enableSetState = false;

            if( that.thermostatService )
            {
                that.log(that.service, "received current cool setpoint",that.set_target_cool_url, "cool setpoint is currently", value);
                that.thermCoolSet = parseFloat(value);
                
                if( that.thermLastState == Characteristic.TargetHeatingCoolingState.AUTO)
                {
                    //Need to adjust the state here because HomeKit doesn't allow a current state of auto.
                    if( that.thermCurrentTemp != -100 && that.thermCoolSet != -100 && that.thermHeatSet != -100 )
                    {
                        var coolDiff = that.thermCurrentTemp - that.thermCoolSet;
                        if( coolDiff < 0 )
                            coolDiff = coolDiff*-1;
                        
                        var heatDiff = that.thermCurrentTemp - that.thermHeatSet;
                        if( heatDiff < 0 )
                            heatDiff = heatDiff*-1;
                        
                        if( coolDiff < heatDiff )
                            state = Characteristic.TargetHeatingCoolingState.COOL;
                        else
                            state = Characteristic.TargetHeatingCoolingState.HEAT;
                    }
                    else
                    {
                        state = Characteristic.TargetHeatingCoolingState.OFF;
                    }
                    that.thermCurState = state;
                }
                
                if( that.thermCurState == Characteristic.TargetHeatingCoolingState.COOL )
                {
                    that.thermostatService.getCharacteristic(Characteristic.TargetTemperature).setValue(that.thermCoolSet);
                }
            }
            
            that.enableSetTemp = true;
            that.enableSetState = true;
        }
        else
        {
            that.enableSet = false;
            switch (that.service) {
                case "Security":
                    that.httpRequest(that.status_url, "", "GET", that.username, that.password, that.sendimmediately, function(error, response, body) {
                                     if (error) {
                                     that.log('HTTP get power function failed: %s', error.message);
                                     return;
                                     } else {
                                     var binaryState = parseInt(body.replace(/\D/g,""));
                                     that.state = binaryState > 0;
                                     if( that.securityService && binaryState < 10 ) {
                                     if( binaryState < 5 ) {
                                     that.secCurState = binaryState;
                                     that.secTarState = binaryState;
                                     } else {
                                     that.secTarState = 0;
                                     }
                                     that.securityService.getCharacteristic(Characteristic.SecuritySystemCurrentState).
                                     setValue(that.secCurState);
                                     that.securityService.getCharacteristic(Characteristic.SecuritySystemTargetState).
                                     setValue(that.secTarState);
                                     }
                                     }});
                    break;
            }
            that.enableSet = true;
        }
        response.end('OK')
    }
    
    const server = http.createServer(requestHandler)
    const port = this.base_url.substr(this.base_url.lastIndexOf('/')+1)*1+10000;
    
    //console.log('Starting server on port '+port+' for service '+that.service)
    {
      server.listen(port, (err) =>
                  {
                    if (err)
                    {
                      return console.log('something bad happened', err)
                    }
                  
                    //console.log(`server is listening on ${port}`)
                  
                    'use strict';
                  
                    var os = require('os');
                    var ifaces = os.networkInterfaces();
                  
                    Object.keys(ifaces).forEach(function (ifname)
                            {
                              var alias = 0;
                                              
                              ifaces[ifname].forEach(function (iface)
                                   {
                                     if ('IPv4' !== iface.family || iface.internal !== false)
                                     {
                                       // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
                                       return;
                                     }
                                                                     
                                     if (alias >= 1)
                                     {
                                       // this single interface has multiple ipv4 addresses
                                       //console.log(ifname + ':' + alias, iface.address);
                                     }
                                     else
                                     {
                                       // this interface has only one ipv4 adress
                                       //console.log(ifname, iface.address);
                                                                     
                                       //console.log("Calling: "+that.base_url+"/SetApplianceIP/"+iface.address)
                                       request(that.base_url+"/SetApplianceIP/"+iface.address,
                                               function (error, response, body)
                                               {
                                                 if (!error && response.statusCode == 200)
                                                 {
                                                   //console.log(body) // Print the google web page.
                                                 }
                                               })
                                     }
                                     ++alias;
                                   });
                           });
                  })
    }
    
    if( this.enable_status == "yes" )
    {
        if( this.service == "Light" || this.service == "Dimmer" || this.service == "Switch" || this.service == "Fan" )
            this.status_url = this.base_url + "/light_state";
        else if( this.service == "Door" || this.service == "Garage Door" || this.service == "Window" ||
                this.service == "Contact" || this.service == "Motion" || this.service == "Lock" || this.service == "Doorbell" )
            this.status_url = this.base_url + "/contact_state";
        else
            this.status_url = this.base_url + "/status";
    }
    
    if( this.enable_level == "yes" )
    {
        if( this.service == "Fan" )
        {
            this.brightness_url       = this.base_url + "/fan/%b";
            this.brightnesslvl_url    = this.base_url + "/brightness";
        }
        else
        {
            this.brightness_url         = this.base_url + "/level/%b";
            this.brightnesslvl_url      = this.base_url + "/brightness";
        }
    }
    
    if( this.service == "Security" )
    {
        this.state_url = this.base_url + "/state/%s";
    }
    
    {
      this.http_method            = config["http_method"] 	  	 	|| "GET";;
      this.http_brightness_method = config["http_brightness_method"]  || this.http_method;
      this.username               = config["username"] 	  	 	 	|| "";
      this.password               = config["password"] 	  	 	 	|| "";
      this.sendimmediately        = config["sendimmediately"] 	 	|| "";
      this.name                   = config["name"];
      this.manufacturer           = config["manufacturer"]            || "Unknown";
      this.model                  = config["model"]                   || "Unknown";
      this.serial                 = config["serial"]                  || "Unknown";
      this.refresh_interval       = config["refresh_interval"]        || 300;
      this.brightnessHandling     = config["brightnessHandling"] 	 	|| "no";
      this.switchHandling 	    = config["switchHandling"] 		 	|| "no";
    }
    
    //realtime polling info
    this.state = false;
    this.lastSent = false;
    this.lastState = false;
    if( this.invert_contact == "yes" )
        this.lastState = true;
    this.secTarState = 3;
    this.secCurState = 3;
    this.currentlevel = 0;
    this.enableSet = true;
    this.enableSetState = true;
    this.enableSetTemp = true;
    this.thermCurState = Characteristic.TargetHeatingCoolingState.OFF;
    this.thermLastState = Characteristic.TargetHeatingCoolingState.OFF;
    this.thermStatus = Characteristic.TargetHeatingCoolingState.OFF;
    this.thermHeatSet = -100;
    this.thermCoolSet = -100;
    this.thermCurrentTemp = -100;
    this.thermTarState = Characteristic.TargetHeatingCoolingState.OFF;
    this.thermTarStateSet = false;
    
    // Status Polling, if you want to add additional services that don't use switch handling you can add something like this || (this.service=="Smoke" || this.service=="Motion"))
    if (this.status_url && this.switchHandling =="realtime")
    {
        var powerurl = this.status_url;
        var curhvacstateurl = "";
        var curheatseturl = "";
        var curcoolseturl = "";
        var curtempurl = "";
        
        if( this.service != "Thermostat" )
        {
            var statusemitter = pollingtoevent(function(done)
                                               {
                                                 that.httpRequest(powerurl, "", "GET", that.username, that.password, that.sendimmediately,
                                                                  function(error, response, body)
                                                                  {
                                                                    if (error)
                                                                    {
                                                                      that.log('HTTP get power function failed: %s', error.message);
                                                                      return;
                                                                    }
                                                                    else
                                                                    {
                                                                      done(null, body);
                                                                    }
                                                                  })
                                               }, {longpolling:true,interval:this.refresh_interval,longpollEventName:"statuspoll"});
            
		    statusemitter.on("statuspoll",
                             function(data)
                             {
                               var binaryState = parseInt(data.replace(/\D/g,""));
                               that.state = binaryState > 0;
                               that.log(that.service, "received power",that.status_url, "state is currently", binaryState);
                             
                               that.enableSet = false;
                               switch (that.service)
                               {
                                 case "Switch":
                                   if (that.switchService )
                                   {
                                     that.switchService.getCharacteristic(Characteristic.On).setValue(that.state);
                                   }
                                   break;
                                 case "Light":
                                 case "Dimmer":
                                   if (that.lightbulbService)
                                   {
                                     that.lightbulbService.getCharacteristic(Characteristic.On).setValue(that.state);
                                   }
                                   break;
                                 case "Door":
                                   if (that.doorService)
                                   {
                                     that.doorService.getCharacteristic(Characteristic.CurrentPosition).setValue(that.state?0:100);
                                     that.doorService.getCharacteristic(Characteristic.TargetPosition).setValue(that.state?0:100);
                                     that.doorService.getCharacteristic(Characteristic.PositionState).setValue(2);
                                   }
                                   break;
                                 case "Window":
                                   if (that.windowService)
                                   {
                                     that.windowService.getCharacteristic(Characteristic.CurrentPosition).setValue(that.state?0:100);
                                     that.windowService.getCharacteristic(Characteristic.TargetPosition).setValue(that.state?0:100);
                                     that.windowService.getCharacteristic(Characteristic.PositionState).setValue(2);
                                   }
                                   break;
                                 case "Garage Door":
                                   if( that.garageService )
                                   {
                                     that.garageService.getCharacteristic(Characteristic.CurrentDoorState).setValue(that.state?Characteristic.CurrentDoorState.CLOSED:Characteristic.CurrentDoorState.OPEN);
                                     that.garageService.getCharacteristic(Characteristic.TargetDoorState).setValue(that.state?Characteristic.TargetDoorState.CLOSED:Characteristic.TargetDoorState.OPEN);
                                   }
                                   break;
                                 case "Lock":
                                   if( that.lockService )
                                   {
                                     that.lockService.getCharacteristic(Characteristic.LockCurrentState).setValue(!that.state?Characteristic.LockCurrentState.SECURED:Characteristic.LockCurrentState.UNSECURED);
                                     that.lockService.getCharacteristic(Characteristic.LockTargetState).setValue(!that.state?Characteristic.LockTargetState.SECURED:Characteristic.LockTargetState.UNSECURED);
                                   }
                                   break;
                                 case "Contact":
                                   if( that.contactService )
                                   {
                                     that.contactService.getCharacteristic(Characteristic.ContactSensorState).setValue(that.state?Characteristic.ContactSensorState.CONTACT_DETECTED:Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
                                   }
                                   break;
                                 case "Doorbell":
                                   if( that.doorbellService )
                                   {
                                     var toCheck = true;
                                     if( that.invert_contact == "yes" )
                                     {
                                       toCheck = false;
                                     }
                                     if( that.state == toCheck && that.state != that.lastState )
                                     {
                                       that.lastSent = !that.lastSent;
                                   
                                       that.doorbellService.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(that.lastSent?1:0);
                                     }
                                     that.lastState = that.state;
                                   }
                                   break;
                                 case "Motion":
                                   if( that.motionService )
                                   {
                                     that.motionService.getCharacteristic(Characteristic.MotionDetected).setValue(!that.state);
                                   }
                                   break;
                                 case "Fan":
                                   if( that.fanService )
                                   {
                                     that.fanService.getCharacteristic(Characteristic.On).setValue(that.state);
                                   }
                                   break;
                                 case "Security":
                                   if( that.securityService && binaryState < 10 )
                                   {
                                     if( binaryState < 5 )
                                     {
                                       that.secCurState = binaryState;
                                       that.secTarState = binaryState;
                                     }
                                     else
                                     {
                                       that.secTarState = 0;
                                     }
                                     that.securityService.getCharacteristic(Characteristic.SecuritySystemCurrentState).setValue(that.secCurState);
                                     that.securityService.getCharacteristic(Characteristic.SecuritySystemTargetState).setValue(that.secTarState);
                                   }
                                   break;
                                 }
                                 that.enableSet = true;
                            });
        }
        else
        {
          // Emitter for current hvac status
          {
            curhvacstatusurl = this.get_status_url;
            var hvacstatusemitter = pollingtoevent(function(done)
                                                 {
                                                   that.httpRequest(curhvacstatusurl, "", "GET", that.username, that.password, that.sendimmediately,
                                                                    function(error, response, body)
                                                                    {
                                                                      if (error)
                                                                      {
                                                                        that.log('HTTP get hvac status function failed: %s', error.message);
                                                                        return;
                                                                      }
                                                                      else
                                                                      {
                                                                        done(null, body);
                                                                      }
                                                                    })
                                                 }, {longpolling:true,interval:this.refresh_interval,longpollEventName:"hvacstatuspoll"});

            hvacstatusemitter.on("hvacstatuspoll",
                               function(data)
                               {
                                 var state = Characteristic.TargetHeatingCoolingState.OFF;
                                 if( data.includes(that.cool_string) )
                                 {
                                    state = Characteristic.TargetHeatingCoolingState.COOL;
                                 }
                                 else if( data.includes(that.heat_string) )
                                 {
                                    state = Characteristic.TargetHeatingCoolingState.HEAT;
                                 }
                                 else if( data.includes(that.auto_string) )
                                 {
                                    state = Characteristic.TargetHeatingCoolingState.AUTO;
                                 }
                                 that.thermStatus = state;

                                 that.log(that.service, "received hvac status",that.get_status_url, "hvac mode is currently", data);

                                 that.enableSetState = false;
                                 that.thermostatService.getCharacteristic(Characteristic.CurrentHeatingCoolingState).setValue(state);
                                 that.enableSetState = true;
                               });
          }

          // Emitter for current hvac mode
          {
            curhvacstateurl = this.get_mode_url;
            var hvacmodeemitter = pollingtoevent(function(done)
                                                 {
                                                   that.httpRequest(curhvacstateurl, "", "GET", that.username, that.password, that.sendimmediately,
                                                                    function(error, response, body)
                                                                    {
                                                                      if (error)
                                                                      {
                                                                        that.log('HTTP get hvac state function failed: %s', error.message);
                                                                        return;
                                                                      }
                                                                      else
                                                                      {
                                                                        done(null, body);
                                                                      }
                                                                    })
                                                 }, {longpolling:true,interval:this.refresh_interval,longpollEventName:"hvacstatepoll"});
            
            hvacmodeemitter.on("hvacstatepoll",
                               function(data)
                               {
                                 var state = Characteristic.TargetHeatingCoolingState.OFF;
                                 if( data == that.cool_string )
                                 {
                                    state = Characteristic.TargetHeatingCoolingState.COOL;
                                 }
                                 else if( data == that.heat_string )
                                 {
                                    state = Characteristic.TargetHeatingCoolingState.HEAT;
                                 }
                                 else if( data == that.auto_string )
                                 {
                                    state = Characteristic.TargetHeatingCoolingState.AUTO;
                                 }
                                 that.thermLastState = state;
                               
                                 that.log(that.service, "received hvac state",that.get_mode_url, "hvac mode is currently", data);
                                 if( !that.thermTarStateSet )
                                 {
                                    that.thermTarStateSet = true;
                                    that.thermTarState = state;
                                    that.enableSetState = false;
                                    that.thermostatService.getCharacteristic(Characteristic.TargetHeatingCoolingState).setValue(that.thermTarState);
                                    that.enableSetState = true;
                                 }

                                 if( that.thermLastState == Characteristic.TargetHeatingCoolingState.AUTO)
                                 {
                                    //Need to adjust the state here because HomeKit doesn't allow a current state of auto.
                                    if( that.thermCurrentTemp != -100 && that.thermCoolSet != -100 && that.thermHeatSet != -100 )
                                    {
                                        var coolDiff = that.thermCurrentTemp - that.thermCoolSet;
                                        if( coolDiff < 0 )
                                            coolDiff = coolDiff*-1;
                               
                                        var heatDiff = that.thermCurrentTemp - that.thermHeatSet;
                                        if( heatDiff < 0 )
                                            heatDiff = heatDiff*-1;
                               
                                        if( coolDiff < heatDiff )
                                            state = Characteristic.TargetHeatingCoolingState.COOL;
                                        else
                                            state = Characteristic.TargetHeatingCoolingState.HEAT;
                                    }
                                    else
                                    {
                                        state = Characteristic.TargetHeatingCoolingState.OFF;
                                    }
                                 }
                               
                                 that.thermCurState = state;

                                 that.enableSetTemp = false;
                                 if( that.thermCurState == Characteristic.TargetHeatingCoolingState.COOL && that.thermCoolSet != -100 )
                                 {
                                    that.thermostatService.getCharacteristic(Characteristic.TargetTemperature).setValue(that.thermCoolSet);
                                 }
                                 if( that.thermCurState == Characteristic.TargetHeatingCoolingState.HEAT && that.thermHeatSet != -100 )
                                 {
                                    that.thermostatService.getCharacteristic(Characteristic.TargetTemperature).setValue(that.thermHeatSet);
                                 }
                                 that.enableSetTemp = true;
                               });
          }
         
          // Emitter for current heat setpoint
          {
                curheatseturl = this.get_target_heat_url;
                var hvacheatsetemitter = pollingtoevent(function(done)
                                                     {
                                                     that.httpRequest(curheatseturl, "", "GET", that.username, that.password, that.sendimmediately,
                                                                      function(error, response, body)
                                                                      {
                                                                        if (error)
                                                                        {
                                                                          that.log('HTTP get hvac heat setpoint function failed: %s', error.message);
                                                                          return;
                                                                        }
                                                                        else
                                                                        {
                                                                          done(null, body);
                                                                        }
                                                                      })
                                                     }, {longpolling:true,interval:this.refresh_interval,longpollEventName:"hvacheatpoll"});
                
                hvacheatsetemitter.on("hvacheatpoll",
                                   function(data)
                                   {
                                     that.thermHeatSet = parseFloat(data);
                                     that.log(that.service, "received hvac heat setpoint",that.get_target_heat_url, "hvac heat setpoint is currently", data);

                                     if( that.thermLastState == Characteristic.TargetHeatingCoolingState.AUTO)
                                     {
                                        //Need to adjust the state here because HomeKit doesn't allow a current state of auto.
                                        if( that.thermCurrentTemp != -100 && that.thermCoolSet != -100 && that.thermHeatSet != -100 )
                                        {
                                            var coolDiff = that.thermCurrentTemp - that.thermCoolSet;
                                            if( coolDiff < 0 )
                                                coolDiff = coolDiff*-1;
                                      
                                            var heatDiff = that.thermCurrentTemp - that.thermHeatSet;
                                            if( heatDiff < 0 )
                                                heatDiff = heatDiff*-1;
                                      
                                            if( coolDiff < heatDiff )
                                                state = Characteristic.TargetHeatingCoolingState.COOL;
                                            else
                                                state = Characteristic.TargetHeatingCoolingState.HEAT;
                                        }
                                        else
                                        {
                                            state = Characteristic.TargetHeatingCoolingState.OFF;
                                        }
                                        that.thermCurState = state;
                                     }

                                     that.enableSetTemp = false;
                                     if( that.thermCurState == Characteristic.TargetHeatingCoolingState.HEAT )
                                     {
                                       that.thermostatService.getCharacteristic(Characteristic.TargetTemperature).setValue(that.thermHeatSet);
                                     }
                                     that.enableSetTemp = true;
                                   });
          }

          // Emitter for current cool setpoint
          {
                curcoolseturl = this.get_target_cool_url;
                var hvaccoolsetemitter = pollingtoevent(function(done)
                                                        {
                                                        that.httpRequest(curcoolseturl, "", "GET", that.username, that.password, that.sendimmediately,
                                                                         function(error, response, body)
                                                                         {
                                                                           if (error)
                                                                           {
                                                                             that.log('HTTP get hvac cool setpoint function failed: %s', error.message);
                                                                             return;
                                                                           }
                                                                           else
                                                                           {
                                                                             done(null, body);
                                                                           }
                                                                         })
                                                        }, {longpolling:true,interval:this.refresh_interval,longpollEventName:"hvaccoolpoll"});
                
                hvaccoolsetemitter.on("hvaccoolpoll",
                                      function(data)
                                      {
                                        that.thermCoolSet = parseFloat(data);
                                        that.log(that.service, "received hvac cool setpoint",that.get_target_cool_url, "hvac cool setpoint is currently", data);
                                      
                                        if( that.thermLastState == Characteristic.TargetHeatingCoolingState.AUTO)
                                        {
                                            //Need to adjust the state here because HomeKit doesn't allow a current state of auto.
                                            if( that.thermCurrentTemp != -100 && that.thermCoolSet != -100 && that.thermHeatSet != -100 )
                                            {
                                                var coolDiff = that.thermCurrentTemp - that.thermCoolSet;
                                                if( coolDiff < 0 )
                                                    coolDiff = coolDiff*-1;
                                      
                                                var heatDiff = that.thermCurrentTemp - that.thermHeatSet;
                                                if( heatDiff < 0 )
                                                    heatDiff = heatDiff*-1;
                                      
                                                if( coolDiff < heatDiff )
                                                    state = Characteristic.TargetHeatingCoolingState.COOL;
                                                else
                                                    state = Characteristic.TargetHeatingCoolingState.HEAT;
                                            }
                                            else
                                            {
                                                state = Characteristic.TargetHeatingCoolingState.OFF;
                                            }
                                            that.thermCurState = state;
                                        }

                                        that.enableSetTemp = false;
                                        if( that.thermCurState == Characteristic.TargetHeatingCoolingState.COOL )
                                        {
                                          that.thermostatService.getCharacteristic(Characteristic.TargetTemperature).setValue(that.thermCoolSet);
                                        }
                                        that.enableSetTemp = true;
                                      });
            }
            
          // Emitter for current temperature
          {
                curtempurl = this.get_temperature_url;
                var hvactempemitter = pollingtoevent(function(done)
                                                        {
                                                        that.httpRequest(curtempurl, "", "GET", that.username, that.password, that.sendimmediately,
                                                                         function(error, response, body)
                                                                         {
                                                                           if (error)
                                                                           {
                                                                             that.log('HTTP get current temperature function failed: %s', error.message);
                                                                             return;
                                                                           }
                                                                           else
                                                                           {
                                                                             done(null, body);
                                                                           }
                                                                         })
                                                        }, {longpolling:true,interval:this.refresh_interval,longpollEventName:"hvactemppoll"});
                
                hvactempemitter.on("hvactemppoll",
                                      function(data)
                                      {
                                        that.thermCurrentTemp = parseFloat(data);
                                        that.log(that.service, "received current temperature",that.get_temperature_url, "temperature is currently", data);
                                        that.thermostatService.getCharacteristic(Characteristic.CurrentTemperature).setValue(that.thermCurrentTemp);
                                   
                                        if( that.thermLastState == Characteristic.TargetHeatingCoolingState.AUTO)
                                        {
                                            //Need to adjust the state here because HomeKit doesn't allow a current state of auto.
                                            if( that.thermCurrentTemp != -100 && that.thermCoolSet != -100 && that.thermHeatSet != -100 )
                                            {
                                                var coolDiff = that.thermCurrentTemp - that.thermCoolSet;
                                                if( coolDiff < 0 )
                                                    coolDiff = coolDiff*-1;
                                   
                                                var heatDiff = that.thermCurrentTemp - that.thermHeatSet;
                                                if( heatDiff < 0 )
                                                    heatDiff = heatDiff*-1;
                                   
                                                if( coolDiff < heatDiff )
                                                    state = Characteristic.TargetHeatingCoolingState.COOL;
                                                else
                                                    state = Characteristic.TargetHeatingCoolingState.HEAT;
                                            }
                                            else
                                            {
                                                state = Characteristic.TargetHeatingCoolingState.OFF;
                                            }
                                            that.thermCurState = state;
                                        }
                                      });
            }

        }
    }
    
    // Brightness Polling
    if (this.brightnesslvl_url && this.brightnessHandling =="realtime")
    {
        var brightnessurl = this.brightnesslvl_url;
        var levelemitter = pollingtoevent(function(done)
                                          {
                                            that.httpRequest(brightnessurl, "", "GET", that.username, that.password, that.sendimmediately,
                                                             function(error, response, responseBody)
                                                             {
                                                               if (error)
                                                               {
                                                                 that.log('HTTP get power function failed: %s', error.message);
                                                                 return;
                                                               }
                                                               else
                                                               {
                                                                 done(null, responseBody);
                                                               }
                                                             }) // set longer polling as slider takes longer to set value
                                          }, {longpolling:true,interval:this.refresh_interval,longpollEventName:"levelpoll"});
        
        levelemitter.on("levelpoll",
                        function(data)
                        {
                          that.currentlevel = parseInt(data);
                        
                          that.enableSet = false;
                        
                          switch (that.service)
                          {
                            case "Light":
                            case "Dimmer":
                              if (that.lightbulbService)
                              {
                                that.log(that.service, "received brightness",that.brightnesslvl_url, "level is currently", that.currentlevel);
                                that.lightbulbService.getCharacteristic(Characteristic.Brightness).setValue(that.currentlevel);
                              }
                              break;
                            case "Fan":
                              if( that.fanService )
                              {
                                that.log(that.service, "received fan level",that.brightnesslvl_url, "level is currently", that.currentlevel);
                                that.fanService.getCharacteristic(Characteristic.RotationSpeed).setValue(that.currentlevel*25);
                              }
                              break;
                            }
                            that.enableSet = true;
                       });
    }
}

HttpAccessory.prototype =
{
  httpRequest: function(url, body, method, username, password, sendimmediately, callback)
               {
                 request('http://localhost/sig/sig.php',
                         function(error, response, body)
                         {
                           var sig = body;
                           var signed = url;
                           if( sig !== undefined && sig !== null && sig != "null" && sig.length > 0 )
                             signed = signed + "?" + sig;
            
                           request({
                               url: signed,
                              body: body,
                            method: method,
                rejectUnauthorized: false,
                              auth: {
                                user: username,
                                pass: password,
                     sendImmediately: sendimmediately
                                    }
                                  },
                            function(error, response, body)
                            {
                              callback(error, response, body)
                            })
                        });
                },
    
  setSecurityState: function(newState, callback)
               {
                 if (this.enableSet == true)
                 {
                   var url;
                   var body;
        
                   if (!this.state_url)
                   {
                     this.log.warn("Ignoring request; No security state url defined.");
                     callback(new Error("No security state url defined."));
                     return;
                   }
        
                   if( newState == 2 )
                     newState = 0;
        
                   this.secTarState = newState;
                   url = this.state_url.replace("%s", newState);
                   this.log("Setting new security state: "+url);
        
                   this.httpRequest(url, body, this.http_method, this.username, this.password, this.sendimmediately,
                                    function(error, response, responseBody)
                                    {
                                      if (error)
                                      {
                                        this.log('HTTP set security state function failed: %s', error.message);
                                        callback(error);
                                      }
                                      else
                                      {
                                        this.log('HTTP set security state function succeeded!');
                                        callback();
                                      }
                                    }.bind(this));
                 }
                 else
                 {
                   callback();
                 }
               },
    
  setPowerState: function(powerOn, callback)
               {
                 if (this.enableSet == true && (this.currentlevel == 0 || !powerOn ))
                 {
                   var url;
                   var body;
        
                   if (!this.on_url || !this.off_url)
                   {
                     this.log.warn("Ignoring request; No power url defined.");
                     callback(new Error("No power url defined."));
                     return;
                   }
        
                   if (powerOn)
                   {
                     url = this.on_url;
                     body = this.on_body;
                     this.log("Setting power state to on");
                   }
                   else
                   {
                     url = this.off_url;
                     body = this.off_body;
                     this.log("Setting power state to off");
                   }
        
                   this.httpRequest(url, body, this.http_method, this.username, this.password, this.sendimmediately,
                                    function(error, response, responseBody)
                                    {
                                      if (error)
                                      {
                                        this.log('HTTP set power function failed: %s', error.message);
                                        callback(error);
                                      }
                                      else
                                      {
                                        this.log('HTTP set power function succeeded!');
                                        callback();
                                      }
                                    }.bind(this));
                }
                else
                {
                  callback();
                }
              },
    
  getPowerState: function(callback)
               {
                 if (!this.status_url)
                 {
                   this.log.warn("Ignoring request; No status url defined.");
                   callback(new Error("No status url defined."));
                   return;
                 }
    
                 var url = this.status_url;
                 this.log("Getting power state");
    
                 this.httpRequest(url, "", "GET", this.username, this.password, this.sendimmediately,
                                  function(error, response, responseBody)
                                  {
                                    if (error)
                                    {
                                      this.log('HTTP get power function failed: %s', error.message);
                                      callback(error);
                                    }
                                    else
                                    {
                                      var binaryState = parseInt(responseBody.replace(/\D/g,""));
                                      var powerOn = binaryState > 0;
                                      this.log("Power state is currently %s", binaryState);
                                      callback(null, powerOn);
                                    }
                                  }.bind(this));
               },
    
  getBrightness: function(callback)
               {
                 if (!this.brightnesslvl_url)
                 {
                   this.log.warn("Ignoring request; No brightness level url defined.");
                   callback(new Error("No brightness level url defined."));
                   return;
                 }
                 var url = this.brightnesslvl_url;
                 this.log("Getting Brightness level");
    
                 this.httpRequest(url, "", "GET", this.username, this.password, this.sendimmediately,
                                  function(error, response, responseBody)
                                  {
                                    if (error)
                                    {
                                      this.log('HTTP get brightness function failed: %s', error.message);
                                      callback(error);
                                    }
                                    else
                                    {
                                      var binaryState = parseInt(responseBody.replace(/\D/g,""));
                                      var level = binaryState;
                                      this.log("brightness state is currently %s", binaryState);
                                      callback(null, level);
                                    }
                                  }.bind(this));
  },
    
  setBrightness: function(level, callback)
               {
                 if (this.enableSet == true)
                 {
                   if (!this.brightness_url)
                   {
                     this.log.warn("Ignoring request; No brightness url defined.");
                     callback(new Error("No brightness url defined."));
                     return;
                   }
        
                   if( this.service == "Fan" )
                       level = Math.round(level/25);
        
                   var url = this.brightness_url.replace("%b", level)
        
                   this.log("Setting brightness to %s", level);
        
                   this.httpRequest(url, "", this.http_brightness_method, this.username, this.password, this.sendimmediately,
                                    function(error, response, body)
                                    {
                                      if (error)
                                      {
                                        this.log('HTTP brightness function failed: %s', error);
                                        callback(error);
                                      }
                                      else
                                      {
                                        this.log('HTTP brightness function succeeded!');
                                        callback();
                                      }
                                    }.bind(this));
                 }
                 else
                 {
                   callback();
                 }
               },

  setThermostatTargetHeatingCoolingState: function(state, callback)
               {
                   if( !this.enableSetState )
                   {
                       callback();
                       return;
                   }
                   
                   if( !this.set_mode_url )
                   {
                       this.log.warn("Ignoring request; No set mode url defined.");
                       callback(new Error("No set mode url defined."));
                       return;
                   }
                   
                   var mode = this.off_string;
                   if( state == Characteristic.TargetHeatingCoolingState.OFF )
                   {
                       mode = this.off_string;
                   }
                   else if( state == Characteristic.TargetHeatingCoolingState.HEAT )
                   {
                       this.thermLastState = Characteristic.TargetHeatingCoolingState.HEAT;
                       mode = this.heat_string;
                   }
                   else if( state == Characteristic.TargetHeatingCoolingState.COOL )
                   {
                       this.thermLastState = Characteristic.TargetHeatingCoolingState.COOL;
                       mode = this.cool_string;
                   }
                   else if( state == Characteristic.TargetHeatingCoolingState.AUTO )
                   {
                       mode = this.auto_string;
                   }
                   
                   var url = this.set_mode_url.replace("%m", mode);
                   
                   this.log("Setting hvac mode to %s", mode);
                   
                   this.httpRequest(url, "", "GET", this.username, this.password, this.sendimmediately,
                                    function(error, response, body)
                                    {
                                        if( error )
                                        {
                                            this.log('HTTP HVAC mode function failed: %s', error);
                                            callback(error);
                                        }
                                        else
                                        {
                                            this.log('HTTP HVAC mode function succeeded!');
                                            callback();
                                        }
                                    }.bind(this));
               },

  setThermostatTargetTemp: function(temp, callback)
               {
                   if( !this.enableSetTemp )
                   {
                       callback();
                       return;
                   }
                   
                   if( temp == -100 )
                     return;

                   if( !this.set_target_cool_url || !this.set_target_heat_url )
                   {
                       this.log.warn("Ignoring request; Both set setpoint urls must be defined.");
                       callback(new Error("Both set setpoint urls must be defined."));
                       return;
                   }
        
                   var mode = this.thermCurState;
                   if( mode == Characteristic.CurrentHeatingCoolingState.OFF)
                   {
                       if( this.thermCurrentTemp != -100 && this.thermCoolSet != -100 && this.thermHeatSet != -100 )
                       {
                           var coolDiff = that.thermCurrentTemp - that.thermCoolSet;
                           if( coolDiff < 0 )
                               coolDiff = coolDiff*-1;
                           
                           var heatDiff = that.thermCurrentTemp - that.thermHeatSet;
                           if( heatDiff < 0 )
                               heatDiff = heatDiff*-1;
                           
                           if( coolDiff < heatDiff )
                               mode = Characteristic.TargetHeatingCoolingState.COOL;
                           else
                               mode = Characteristic.TargetHeatingCoolingState.HEAT;
                       }
                       else
                       {
                           mode = Characteristic.TargetHeatingCoolingState.COOL;
                       }
                   }
        
                   var url = this.set_target_heat_url.replace("%c",temp);
                   var modeString = "heat setpoint";
                   if( mode == Characteristic.TargetHeatingCoolingState.COOL )
                   {
                       url = this.set_target_cool_url.replace("%c",temp);
                       modeString = "cool setpoint";
                   }
        
                   this.log("Setting %s to %s", modeString, temp);
        
                   this.httpRequest(url, "", "GET", this.username, this.password, this.sendimmediately,
                         function(error, response, body)
                         {
                            if( error )
                            {
                                this.log('HTTP HVAC setpoint function failed: %s', error);
                                callback(error);
                            }
                            else
                            {
                                this.log('HTTP HVAC setpoint function succeeded!');
                                callback();
                            }
                         }.bind(this));
              },

  identify: function(callback)
              {
                this.log("Identify requested!");
                callback(); // success
              },
    
  getServices: function()
              {
                  var that = this;
    
                  // you can OPTIONALLY create an information service if you wish to override
                  // the default values for things like serial number, model, etc.
                  var informationService = new Service.AccessoryInformation();
    
                  informationService
                    .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
                    .setCharacteristic(Characteristic.Model, this.model)
                    .setCharacteristic(Characteristic.SerialNumber, this.serial);
    
                  switch (this.service)
                  {
                      case "Switch":
                      {
                          this.switchService = new Service.Switch(this.name);
                          switch (this.switchHandling)
                          {
                              //Power Polling
                              case "yes":
                              case "realtime":
                                  this.switchService
                                    .getCharacteristic(Characteristic.On)
                                    .on('get', this.getPowerState.bind(this))
                                    .on('set', this.setPowerState.bind(this));
                                  break;
                              default	:
                                  this.switchService
                                    .getCharacteristic(Characteristic.On)
                                    .on('set', this.setPowerState.bind(this));
                              break;
                          }
                          return [this.switchService];
                      }
                          
                      case "Light":
                      case "Dimmer":
                      {
                          this.lightbulbService = new Service.Lightbulb(this.name);
                          switch (this.switchHandling)
                          {
                              //Power Polling
                              case "yes" :
                              case "realtime" :
                                  this.lightbulbService
                                    .getCharacteristic(Characteristic.On)
                                    .on('get', this.getPowerState.bind(this))
                                    .on('set', this.setPowerState.bind(this));
                                  break;
                              default:
                                  this.lightbulbService
                                    .getCharacteristic(Characteristic.On)
                                    .on('set', this.setPowerState.bind(this));
                                  break;
                          }
                          
                          // Brightness Polling
                          if (this.brightnessHandling == "realtime" || this.brightnessHandling == "yes")
                          {
                              this.lightbulbService
                                .addCharacteristic(new Characteristic.Brightness())
                                .on('get', this.getBrightness.bind(this))
                                .on('set', this.setBrightness.bind(this));
                          }
            
                          return [informationService, this.lightbulbService];
                          break;
                      }
                          
                      case "Door":
                      {
                          this.doorService = new Service.Door(this.name);
                          this.doorService
                            .getCharacteristic(Characteristic.CurrentPosition)
                            .on('get', function(callback) {callback(null,that.state?0:100)});
                          
                          this.doorService
                            .getCharacteristic(Characteristic.TargetPosition)
                            .on('get', function(callback) {callback(null,that.state?0:100)})
                            .on('set', this.setPowerState.bind(this));
                          
                          this.doorService
                            .getCharacteristic(Characteristic.PositionState)
                            .on('get', function(callback) {callback(null,2)});
                          
                          return [informationService, this.doorService];
                          break;
                      }
                          
                      case "Window":
                      {
                          this.windowService = new Service.Window(this.name);
                          this.windowService
                            .getCharacteristic(Characteristic.CurrentPosition)
                            .on('get', function(callback) {callback(null,that.state?0:100)});
                          
                          this.windowService
                            .getCharacteristic(Characteristic.TargetPosition)
                            .on('get', this.getPowerState.bind(this))
                            .on('set', this.setPowerState.bind(this));
                          
                          this.windowService
                            .getCharacteristic(Characteristic.PositionState)
                            .on('get', function(callback) {callback(null,2)});
                          
                          return [informationService, this.windowService];
                          break;
                      }
                          
                      case "Garage Door":
                      {
                          this.garageService = new Service.GarageDoorOpener(this.name);
                          this.garageService
                            .getCharacteristic(Characteristic.CurrentDoorState)
                            .on('get', function(callback) {callback(null,that.state?Characteristic.CurrentDoorState.CLOSED:Characteristic.CurrentDoorState.OPEN)});
                          
                          this.garageService
                            .getCharacteristic(Characteristic.TargetDoorState)
                            .on('get', this.getPowerState.bind(this))
                            .on('set', this.setPowerState.bind(this));
                          
                          this.garageService
                            .getCharacteristic(Characteristic.ObstructionDetected)
                            .on('get', function(callback) {callback(null,false)});
                          
                          return [informationService, this.garageService];
                          break;
                      }
                          
                      case "Lock":
                      {
                          this.lockService = new Service.LockMechanism(this.name);
                          this.lockService
                            .getCharacteristic(Characteristic.LockCurrentState)
                            .on('get', function(callback) {callback(null,!that.state?Characteristic.LockCurrentState.SECURED:Characteristic.LockCurrentState.UNSECURED)});
                          
                          this.lockService
                            .getCharacteristic(Characteristic.LockTargetState)
                            .on('get', function(callback) {callback(null,!that.state?Characteristic.LockCurrentState.SECURED:Characteristic.LockCurrentState.UNSECURED)})
                            .on('set', this.setPowerState.bind(this));
                          
                          return [informationService, this.lockService];
                          break;
                      }
                          
                      case "Contact":
                      {
                          this.contactService = new Service.ContactSensor(this.name);
                          this.contactService
                            .getCharacteristic(Characteristic.ContactSensorState)
                            .on('get', function(callback) {
                                callback(null,that.state?Characteristic.ContactSensorState.CONTACT_DETECTED:Characteristic.ContactSensorState.CONTACT_NOT_DETECTED)
                                });
                          
                          return [informationService, this.contactService];
                          break;
                      }
                          
                      case "Doorbell":
                      {
                          this.cameraService = new Service.CameraRTPStreamManagement(this.name);
                          this.doorbellService = new Service.Doorbell(this.name);
                          this.doorbellService
                            .getCharacteristic(Characteristic.ProgrammableSwitchEvent)
                            .on('get', function(callback) {
                                callback(null,that.lastSent?1:0)});
                          
                          if( this.include_video )
                              return [informationService, this.doorbellService, this.cameraService];
                          else
                              return [informationService, this.doorbellService];
                          break;
                      }
                          
                      case "Motion":
                      {
                          this.motionService = new Service.MotionSensor(this.name);
                          this.motionService
                            .getCharacteristic(Characteristic.MotionDetected)
                            .on('get', function(callback) { callback(null,!that.state)});
                          
                          return [informationService, this.motionService];
                          break;
                      }
                          
                      case "Fan":
                      {
                          this.fanService = new Service.Fan(this.name);
                          this.fanService
                            .getCharacteristic(Characteristic.On)
                            .on('get', this.getPowerState.bind(this))
                            .on('set', this.setPowerState.bind(this));
                          
                          // Brightness Polling
                          if (this.brightnessHandling == "realtime" || this.brightnessHandling == "yes")
                          {
                              this.fanService
                                .addCharacteristic(new Characteristic.RotationSpeed())
                                .on('get', this.getBrightness.bind(this))
                                .on('set', this.setBrightness.bind(this))
                                .setProps({minStep:25});
                          }
                          
                          return [informationService, this.fanService];
                          break;
                      }
                          
                      case "Security":
                      {
                          this.securityService = new Service.SecuritySystem(this.name);
                          this.securityService
                            .getCharacteristic(Characteristic.SecuritySystemCurrentState)
                            .on('get', function(callback) {callback(null,that.secCurState)});
                          
                          this.securityService
                            .getCharacteristic(Characteristic.SecuritySystemTargetState)
                            .on('get', function(callback) {callback(null,that.secTarState)})
                            .on('set', this.setSecurityState.bind(this));
                          
                          return [informationService, this.securityService];
                          break;
                      }
                          
                      case "Thermostat":
                      {
                          this.thermostatService = new Service.Thermostat(this.name);
                          this.thermostatService
                            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
                            .on('get', function(callback) { that.log("Thermostat get current state: "+that.thermStatus); callback(null,that.thermStatus)});
                          
                          this.thermostatService
                            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
                            .on('get', function(callback) { that.log("Thermostat get target state: "+that.thermTarState); callback(null,that.thermTarState)})
                            .on('set', this.setThermostatTargetHeatingCoolingState.bind(this));
                          
                          this.thermostatService
                            .getCharacteristic(Characteristic.CurrentTemperature)
                            .on('get', function(callback) { that.log("Thermostat get current temp: "+that.thermCurrentTemp); callback(null,that.thermCurrentTemp)});
                          
                          this.thermostatService
                            .getCharacteristic(Characteristic.TargetTemperature)
                            .on('get', function(callback)
                                       {
                                         that.log("Thermostat get target temp "+that.thermCurState);
                                         if( that.thermCurState == Characteristic.TargetHeatingCoolingState.OFF )
                                         {
                                                that.log("Temp from off mode");
                                                //Need to adjust the state here because HomeKit doesn't allow a current state of auto.
                                                var state = Characteristic.TargetHeatingCoolingState.OFF;
                                                if( that.thermCurrentTemp != -100 && that.thermCoolSet != -100 && that.thermHeatSet != -100 )
                                                {
                                                    var coolDiff = that.thermCurrentTemp - that.thermCoolSet;
                                                    if( coolDiff < 0 )
                                                        coolDiff = coolDiff*-1;
                                
                                                    var heatDiff = that.thermCurrentTemp - that.thermHeatSet;
                                                    if( heatDiff < 0 )
                                                        heatDiff = heatDiff*-1;
                                
                                                    if( coolDiff < heatDiff )
                                                        state = Characteristic.TargetHeatingCoolingState.COOL;
                                                    else
                                                        state = Characteristic.TargetHeatingCoolingState.HEAT;
                                                }
                                
                                                if( state == Characteristic.TargetHeatingCoolingState.COOL )
                                                {
                                                    that.log("Sending "+that.thermCoolSet);
                                                    callback(null,that.thermCoolSet);
                                                }
                                                else
                                                {
                                                    that.log("Sending "+that.thermHeatSet);
                                                    callback(null,that.thermHeatSet);
                                                }
                                         }
                                
                                         else if( that.thermCurState == Characteristic.TargetHeatingCoolingState.COOL )
                                           { that.log("Sending "+that.thermCoolSet); callback(null,that.thermCoolSet)}
                              
                                         else if( that.thermCurState == Characteristic.TargetHeatingCoolingState.HEAT )
                                           { that.log("Sending "+that.thermHeatSet); callback(null,that.thermHeatSet)}
 
                                         else { that.log("What?"); }
                                       })
                            .on('set', this.setThermostatTargetTemp.bind(this));
                          
                          this.thermostatService
                            .getCharacteristic(Characteristic.TemperatureDisplayUnits)
                            .on('get', function(callback) {callback(null,that.thermDisplayUnits)})
                            .on('set', function(state,callback) { that.thermDisplayUnits = state; callback(); });
                          
                          return [informationService, this.thermostatService];
                          break;
                      }
                }
            }
};
