'use strict';
var alexa = require('alexa-app'),
    HarmonyUtils = require('harmony-hub-util'),
    harmony_clients = {},
    conf = require('./remote_conf.js'),
    Q = require('q'),
    hub_ip = conf.hub_ip,
    app_id = conf.app_id,
    app_id='amzn1.echo-sdk-ams.app.f42574bf-0700-4e04-891a-83ae05251d51',
    MAX_ACTIVITY_WAIT_TIME_MS = 15000;

//
// Define an alexa-app
var app = new alexa.app('remote');

var fan = 0;
var air = 1;

app.launch(function(req, res) {
    console.log("Launching the application");
});


function execCmdDF(hutils, is_device, dev_or_act, cmd, cnt, fn, res) {
    console.log("execCmd called with cnt = " + cnt + " is_dev " + is_device +
                " dev/act " + dev_or_act + " cmd = " + cmd);
    if (cnt === 0) {
        fn(res);
        hutils.end();
        return;
    }
    hutils.executeCommand(is_device, dev_or_act, cmd).then(function (res) {
        console.log(cnt + ". Command " + cmd + " to device/activity " +
                    dev_or_act + " was executed with result : " + res);
        if (res) {
            setTimeout(function () {
                execCmdDF(hutils, is_device, dev_or_act, cmd, cnt - 1, fn, res);
            }, 100);
        }
    }, function(err) {
        console.log("ERROR Occured " + err);
        console.log("      stack " + err.stack);
    });
}

function execCmd(dev, cmd, cnt, fn, res) {
    new HarmonyUtils(hub_ip).then(function (hutil) {
        execCmdDF(hutil, true, dev, cmd, cnt, fn, res);
    });
}

function execCmdCurrentActivity(cmd, cnt, fn, res) {
    new HarmonyUtils(hub_ip).then(function (hutils) {
        hutils.readCurrentActivity().then(function (current_activity) {
            execCmdDF(hutils, false, current_activity, cmd, cnt, fn, res);
        });
    });
}

/**
 * Waits for a specific activity to be the current activity
 * (assumes the activity has already been executed).
 * 
 * @param {string} hutils - The hutils to use
 * @param {string} act - The activity to wait for
 * @param {number} max_wait_timestamp - The timestamp to give up on waiting
 * @returns deferred promise
 */
function waitForActivity(hutils, act, max_wait_timestamp) {
   var deferred = Q.defer(),
      wait_interval = 3000;
   
   hutils.readCurrentActivity().then(function (current_activity) {
      if (current_activity != act) {
         if (Date.now() > max_wait_timestamp) {
            deferred.reject('Max wait time exceeded waiting for ' + act);
            return;
         }
         console.log(act + ' is not the current activity yet, waiting another ' + wait_interval + 'ms ...');
         setTimeout(function () {
            waitForActivity(hutils, act, max_wait_timestamp).then(function (res) {
               deferred.resolve(res);
            }, function (err) {
               deferred.reject(err);
            });
         }, wait_interval);
      } else {
         console.log(act + ' is now the current activity');
         deferred.resolve(true);
      }
   }, function (err) {
      deferred.reject(err);
   });
   
   return deferred.promise;
}

/**
 * Executes a command for a specific activity, executing and waiting
 * for that activity if needed.
 * 
 * @param {string} act - The activity the command should be executed under
 * @param {string} cmd - The command to execute
 * @param {string} cnt - The count
 */
function execActivityCmd(act, cmd, cnt) {
   new HarmonyUtils(hub_ip).then(function (hutils) {
       hutils.readCurrentActivity().then(function (current_activity) {
          if (current_activity != act) {
             // Need to switch activities and wait
             execActivity(act, function (res) {
                waitForActivity(hutils, act, Date.now() + MAX_ACTIVITY_WAIT_TIME_MS).then(function (res) {
                   execCmdCurrentActivity(cmd, 1, function (res) {
                      hutils.end();
                      console.log('Command executed with result : ' + res);
                   });
                }, function (err) { 
                   console.error(err);
                   hutils.end();
                });
             });
          } else {
             console.log(act + ' is already the current activity, executing command');
             execCmdCurrentActivity(cmd, 1, function (res) {
                console.log('Command executed with result : ' + res);
                hutils.end();
             });
          }
       });
   });
}

function execActivity(act, fn) {
    new HarmonyUtils(hub_ip).then(function (hutils) {
        hutils.executeActivity(act).then(function (res) {
            fn(res);
        });
    });
}

app.pre = function(req, res, type) {
    if (req.applicationId !== app_id) {
        console.log(" Received and invalid applicaiton ID " + req.applicationId);
        res.fail("Invalid applicationId");
    }
};


// TV

app.intent('SharpTVMute',
    {
        "slots" : {},
        "utterances" : ["{mute TV |unmute TV | TV mute | TV unmute}"]
    },
    function (req, res) {
        res.say('Muting!');
        console.log('Muting!');
        execCmd('SharpTV', 'Mute', 1, function (res) {
            console.log("Command TV Mute executed with result : " + res);
        });
    });

app.intent('IncreaseSharpTVVolume',
    {
        "slots" : {'AMOUNT' : 'NUMBER'},
        "utterances" : ["{increase|} TV volume by {1-9|AMOUNT}"]
    },
    function (req, res) {
        var amt = parseInt(req.slot('AMOUNT'), 10);
        if (isNaN(amt)) {
            amt = 1;
        }
        if (amt > 10) {
            amt = 10;
        }
        res.say('Increasing TV volume by ' + amt);
        console.log('Increasing volume by ' + amt);
        execCmd('SharpTV', 'VolumeUp', amt, function (res) {
            console.log("Command Volume UP was executed with result : " + res);
        });
    });

app.intent('DecreaseSharpTVVolume',
    {
        "slots" : {'AMOUNT' : 'NUMBER'},
        "utterances" : ["{decrease TV volume|reduce TV volume} by {1-9|AMOUNT}"]
    },
    function (req, res) {
        var amt = parseInt(req.slot('AMOUNT'), 10);
        if (isNaN(amt)) {
            amt = 1;
        }
        if (amt > 10) {
            amt = 10;
        }
        res.say('Decreasing TV volume by ' + amt);
        console.log('Decreasing volume by ' + amt);
        execCmd('SharpTV', 'VolumeDown', amt, function (res) {
            console.log("Command Volume Down was executed with result : " + res);
        });
    });

app.intent('TurnOffTV',
    {
        "slots" : {},
        "utterances" : ["{turn the TV off|turn TV off| TV off}"]
    },
    function (req, res) {
        res.say('Turning TV off!');
        console.log('Turning TV off!');
        execCmd('SharpTV', 'PowerToggle', 1, function (res) {
            console.log("Command TV PowerOff executed with result : " + res);
        });
    });

app.intent('TurnOnTV',
    {
        "slots" : {},
        "utterances" : ["{turn on the TV|turn the TV on|turn on TV|turn TV on |TV on}"]
    },
    function (req, res) {
        res.say('Turning TV on!');
        console.log('Turning TV on!');
        execCmd('SharpTV', 'PowerToggle', 1, function (res) {
            console.log("Command TV PowerOn executed with result : " + res);
        });
    });
app.intent('ChangeTVInputNext',
    {
        "slots" : {},
        "utterances" : ["{ Next input | TV input Next | Next TV Input}"]
    },
    function (req, res) {
        res.say('TV input changed!');
        console.log('TV input changed!');
        execCmd('SharpTV', 'Input', 1, function (res) {
            console.log("Command TV Input changed executed with result : " + res);
        });
    });
app.intent('ChangeTVInput',
    {
        "slots" : {},
        "utterances" : ["{Change TV |input change | change TV input |change input | TV input}"]
    },
    function (req, res) {
        res.say('TV input changed!');
        console.log('TV input changed!');
        execCmd('SharpTV', 'Input', 2, function (res) {
            console.log("Command TV Input changed executed with result : " + res);
        });
    });
app.intent('ChangeTVInputThree',
    {
        "slots" : {},
        "utterances" : ["{Change TV input three |input change three| change input three | TV input three}"]
    },
    function (req, res) {
        res.say('TV input changed!');
        console.log('TV input changed!');
        execCmd('SharpTV', 'Input', 3, function (res) {
            console.log("Command TV Input changed executed with result : " + res);
        });
    });
app.intent('ChangeTVInputAppleToCable',
    {
        "slots" : {},
        "utterances" : ["{Change TV input to Cable |cable input| change input cable | TV input cable}"]
    },
    function (req, res) {
        res.say('TV input changed!');
        console.log('TV input changed!');
        execCmd('SharpTV', 'Input', 6, function (res) {
            console.log("Command TV Input changed executed with result : " + res);
        });
    });

//Fio TV
app.intent('DVROn',
    {
        "slots" : {},
        "utterances" : ["{Turn on Cable | Cable On | Turn Cable On }"]
    },
    function (req, res) {
        res.say('Cable On!');
        console.log('Cable On!');
        execCmd('DVR', 'PowerToggle', 1, function (res) {
            console.log("Command DVR On executed with result : " + res);
        });
        execCmd('SharpTV', 'PowerToggle', 1, function (res) {
            console.log("Command TV On executed with result : " + res);
        });
    });

app.intent('DVROff',
    {
        "slots" : {},
        "utterances" : ["{Turn off Cable | Cable Off | Turn Cable Off }"]
    },
    function (req, res) {
        res.say('Cable Off!');
        console.log('Cable Off!');
        execCmd('DVR', 'PowerToggle', 1, function (res) {
            console.log("Command DVR Off executed with result : " + res);
        });
        execCmd('SharpTV', 'PowerToggle', 1, function (res) {
            console.log("Command TV Off executed with result : " + res);
        });
    });

app.intent('DVRChannelUp',
    {
        "slots" : {},
        "utterances" : ["{Channel Up | Cable Channel up | TV channel up }"]
    },
    function (req, res) {
        res.say('Channel Up!');
        console.log('Channel Up!');
        execCmd('DVR', 'ChannelUp', 1, function (res) {
            console.log("Command DVR Channel Up executed with result : " + res);
        });
    });

app.intent('DVRChannelDown',
    {
        "slots" : {},
        "utterances" : ["{Channel Down | Cable Channel Down | TV channel Down }"]
    },
    function (req, res) {
        res.say('Channel Down!');
        console.log('Channel Down!');
        execCmd('DVR', 'ChannelDown', 1, function (res) {
            console.log("Command DVR Channel Down executed with result : " + res);
        });
    });

app.intent('DVRChannelPrevious',
    {
        "slots" : {},
        "utterances" : ["{Channel Go back| go back | Previous channel }"]
    },
    function (req, res) {
        res.say('Channel going back!');
        console.log('Channel going back!');
        execCmd('DVR', 'ChannelPrev', 1, function (res) {
            console.log("Command DVR Channel Previous executed with result : " + res);
        });
    });


//Apple TV 
app.intent('AppleTVOn',
    {
        "slots" : {},
        "utterances" : ["{Turn on Apple TV | Warm Up | Apple TV On }"]
    },
    function (req, res) {
        res.say('Apple TV On!');
        console.log('Apple TV On!');
        execCmd('SharpTV', 'PowerToggle', 1, function (res) {
            console.log("Command TV On executed with result : " + res);
        });
        execCmd('AppleTV', 'Power', 1, function (res) {
            console.log("Command Apple TV On executed with result : " + res);
        });
    });

app.intent('AppleTVOff',
    {
        "slots" : {},
        "utterances" : ["{Turn off Apple TV | Apple TV Off }"]
    },
    function (req, res) {
        res.say('Apple TV Off!');
        console.log('Apple TV Off!');
        execCmd('SharpTV', 'PowerToggle', 1, function (res) {
            console.log("Command TV Off executed with result : " + res);
        });
        execCmd('AppleTV', 'Home', 1, function (res) {
            console.log("Command Apple TV Off executed with result : " + res);
        });
    });

app.intent('AppleTVSelect',
    {
        "slots" : {},
        "utterances" : ["{ Select | Go ahead }"]
    },
    function (req, res) {
        res.say('Apple TV selected!');
        console.log('Apple TV selected!');
        execCmd('AppleTV', 'Select', 1, function (res) {
            console.log("Command Apple TV Select executed with result : " + res);
        });
    });

// Sony Reciver

app.intent('SpeakerOn',
    {
        "slots" : {},
        "utterances" : ["{Speaker|start Speaker|Speaker on| turn speaker on| turn on speaker}"]
    },
    function (req, res) {
        res.say('Turning on Speaker!');
        console.log('Turning on Speaker!');
        execCmd('Speaker', 'PowerOn', 1, function (res) {
            console.log("Command Speaker On executed with result : " + res);
        });
    });

app.intent('SpeakerOff',
    {
        "slots" : {},
        "utterances" : ["{Speaker|Turn off Speaker|Turn Speaker Off |Speaker off| shut down Speaker}"]
    },
    function (req, res) {
        res.say('Turning off Speaker!');
        console.log('Turning off Speaker!');
        execCmd('Speaker', 'PowerOff', 1, function (res) {
            console.log("Command Speaker off executed with result : " + res);
        });
    });

app.intent('IncreaseSpeakerVolume',
    {
        "slots" : {'AMOUNT' : 'NUMBER'},
        "utterances" : ["{increase|} Speaker volume by {1-9|AMOUNT}"]
    },
    function (req, res) {
        var amt = parseInt(req.slot('AMOUNT'), 10);
        if (isNaN(amt)) {
            amt = 1;
        }
        if (amt > 10) {
            amt = 10;
        }
        res.say('Increasing Speaker volume by ' + amt);
        console.log('Increasing volume by ' + amt);
        execCmd('Speaker', 'VolumeUp', amt, function (res) {
            console.log("Command Volume UP was executed with result : " + res);
        });
    });

app.intent('DecreaseSpeakerVolume',
    {
        "slots" : {'AMOUNT' : 'NUMBER'},
        "utterances" : ["{decrease|} Speaker volume by {1-9|AMOUNT}"]
    },
    function (req, res) {
        var amt = parseInt(req.slot('AMOUNT'), 10);
        if (isNaN(amt)) {
            amt = 1;
        }
        if (amt > 10) {
            amt = 10;
        }
        res.say('decreasing Speaker volume by ' + amt);
        console.log('decreasing volume by ' + amt);
        execCmd('Speaker', 'VolumeDown', amt, function (res) {
            console.log("Command Volume Down was executed with result : " + res);
        });
    });

app.intent('MuteSpeaker',
    {
        "slots" : {},
        "utterances" : ["{mute speaker|quiet|shut up|unmute speaker}"]
    },
    function (req, res) {
        res.say('Muting!');
        console.log('Muting!');
        execCmd('Speaker', 'Mute', 1, function (res) {
            console.log("Command Mute was executed with result : " + res);
        });
    });

app.intent('SpeakerInputOne',
    {
        "slots" : {},
        "utterances" : ["{speaker input one| give me speaker input one | speaker video one }"]
    },
    function (req, res) {
        res.say('Speaker input one!');
        console.log('Speaker input one!');
        execCmd('Speaker', 'InputVideo1', 1, function (res) {
            console.log("Command InputVideo1 was executed with result : " + res);
        });
    });

app.intent('SpeakerInputTwo',
    {
        "slots" : {},
        "utterances" : ["{speaker input two| give me speaker input two | speaker video two }"]
    },
    function (req, res) {
        res.say('Speaker input two!');
        console.log('Speaker input two!');
        execCmd('Speaker', 'InputVideo2', 1, function (res) {
            console.log("Command InputVideo2 was executed with result : " + res);
        });
    });


// Imac sleep

app.intent('MacSleep',
    {
        "slots" : {},
        "utterances" : ["{put i mac into sleep| i mac sleep }"]
    },
    function (req, res) {
        res.say('iMac sleeping now!');
        console.log('iMac sleeping!');
        execCmd('iMac', 'Sleep', 1, function (res) {
            console.log("Command iMac sleep was executed with result : " + res);
        });
    });



// Display with HDMI switch

app.intent('MacDisplay',
    {
        "slots" : {},
        "utterances" : ["{I Mac Display| switch to I Mac Display| I Mac Display On}"]
    },
    function (req, res) {
        res.say('Switch to IMac Display');
        console.log('Switch to IMac Display!');
        execCmd('Display', 'Input1', 1, function (res) {
            console.log("Command Display Input 1 executed with result : " + res);
        });
    });

app.intent('MacBookDisplay',
    {
        "slots" : {},
        "utterances" : ["{Mac Book Display| switch display to mac book | Mac Book Display On}"]
    },
    function (req, res) {
        res.say('Switch to MacBook Display');
        console.log('Switch to MacBook Display!');
        execCmd('Display', 'Input2', 1, function (res) {
            console.log("Command Display Input 2 executed with result : " + res);
        });
    });

app.intent('PcDisplay',
    {
        "slots" : {},
        "utterances" : ["{PC Display|swtich to PC Display|PC Display On}"]
    },
    function (req, res) {
        res.say('Switch to PC Display');
        console.log('Switch to PC Display!');
        execCmd('Display', 'Input3', 1, function (res) {
            console.log("Command Display Input 3 executed with result : " + res);
        });
    });

// window fan
app.intent('WindowFanSpeed',
    {
        "slots" : {},
        "utterances" : ["{Change Window Fan speed | Window Fan speed change}"]
    },
    function (req, res) {
        res.say('Window Fan Speed changed');
        console.log('Window Fan Mode Speed!');
        execCmd('WindowFan', 'Power', 1, function (res) {
            console.log("Command Window Fan Speed executed with result : " + res);
        });
    });

app.intent('WindowFanOff',
    {
        "slots" : {},
        "utterances" : ["{Window Fan Off|Fan Off|turn off window fan|turn Window fan off}"]
    },
    function (req, res) {
        switch (fan){
            case 1:
                res.say('Window Fan off');
                console.log('Window Fan off!');
                execCmd('WindowFan', 'Power', 3, function (res) {
                    console.log("Command Window Fan Speed executed with result : " + res);
                });
                fan = 0;
                break; 
            case 2:
                res.say('Window Fan off');
                console.log('Window Fan off!');
                execCmd('WindowFan', 'Power', 2, function (res) {
                    console.log("Command Window Fan Speed executed with result : " + res);
                });
                fan = 0;
                break; 
            case 3:
                res.say('Window Fan off');
                console.log('Window Fan off!');
                execCmd('WindowFan', 'Power', 1, function (res) {
                    console.log("Command Window Fan Speed executed with result : " + res);
                });
                fan = 0;
                break;      
        }
    });

app.intent('WindowFanSpeedLow',
    {
        "slots" : {},
        "utterances" : ["{Window Fan Low|Window Fan Speed Low | Fan Low | Fan on | window Fan on | turn on window fan| turn window fan on}"]
    },
    function (req, res) {
        switch (fan){
            case 0:
                res.say('Window Fan Speed Low');
                console.log('Window Fan Speed Low!');
                execCmd('WindowFan', 'Power', 1, function (res) {
                    console.log("Command Window Fan Speed executed with result : " + res);
                });
                fan = 1;
                break; 
            case 0:
                res.say('Window Fan Speed Low Already');
                console.log('Window Fan Speed Low!');
                fan = 1;
                break;  
            case 2:
                res.say('Window Fan Speed Low');
                console.log('Window Fan Speed Low!');
                execCmd('WindowFan', 'Power', 3, function (res) {
                    console.log("Command Window Fan Speed executed with result : " + res);
                });
                fan = 1;
                break; 
            case 3:
                res.say('Window Fan Speed Low');
                console.log('Window Fan Speed Low!');
                execCmd('WindowFan', 'Power', 2, function (res) {
                    console.log("Command Window Fan Speed executed with result : " + res);
                });
                fan = 1;
                break;      
        }
    });

app.intent('WindowFanSpeedMid',
    {
        "slots" : {},
        "utterances" : ["{Window Fan Middle|Window Fan Speed Middle | Fan Middle}"]
    },
    function (req, res) {
        switch (fan){
            case 0:
                res.say('Window Fan Speed Mid');
                console.log('Window Fan Speed Mid!');
                execCmd('WindowFan', 'Power', 2, function (res) {
                    console.log("Command Window Fan Speed executed with result : " + res);
                });
                fan = 2;
                break;
            case 1:
                res.say('Window Fan Speed Mid');
                console.log('Window Fan Speed Mid!');
                execCmd('WindowFan', 'Power', 1, function (res) {
                    console.log("Command Window Fan Speed executed with result : " + res);
                });
                fan = 2;
                break;
            case 2:
                res.say('Window Fan Speed Mid Already');
                console.log('Window Fan Speed Mid!');
                fan = 2;
                break;
            case 3:
                res.say('Window Fan Speed Mid');
                console.log('Window Fan Speed Mid!');
                execCmd('WindowFan', 'Power', 3, function (res) {
                    console.log("Command Window Fan Speed executed with result : " + res);
                });
                fan = 2;
                break;       
        }
    });

app.intent('WindowFanSpeedHigh',
    {
        "slots" : {},
        "utterances" : ["{Window Fan High|Window Fan Speed High | Fan High}"]
    },
    function (req, res) {
        switch (fan){
            case 0:
                res.say('Window Fan Speed High');
                console.log('Window Fan Speed High!');
                execCmd('WindowFan', 'Power', 3, function (res) {
                    console.log("Command Window Fan Speed executed with result : " + res);
                });
                fan = 3;
                break; 
            case 1:
                res.say('Window Fan Speed High');
                console.log('Window Fan Speed High!');
                execCmd('WindowFan', 'Power', 2, function (res) {
                    console.log("Command Window Fan Speed executed with result : " + res);
                });
                fan = 3;
                break; 
            case 2:
                res.say('Window Fan Speed High');
                console.log('Window Fan Speed High!');
                execCmd('WindowFan', 'Power', 1, function (res) {
                    console.log("Command Window Fan Speed executed with result : " + res);
                });
                fan = 3;
                break;  
            case 3:
                res.say('Window Fan Speed High Already');
                console.log('Window Fan Speed High!');
                fan = 3;
                break;    
        }
    });

app.intent('WindowFanMode',
    {
        "slots" : {},
        "utterances" : ["{Window Fan Mode on|Window Fan Mode off }"]
    },
    function (req, res) {
        res.say('Window Fan Mode changed');
        console.log('Window Fan Mode changed!');
        execCmd('WindowFan', 'Mode', 1, function (res) {
            console.log("Command Window Fan Mode executed with result : " + res);
        });
    });

app.intent('WindowFanAirFlow',
    {
        "slots" : {},
        "utterances" : ["{Window Fan Air Flow|change Window Fan Air Flow| Air Flow | change Air Flow }"]
    },
    function (req, res) {
        res.say('Window Fan AirFlow changed');
        console.log('Window Fan AirFlow changed!');
        execCmd('WindowFan', 'Airflow', 1, function (res) {
            console.log("Command Window Fan AirFlow executed with result : " + res);
        });
    });

app.intent('WindowFanAirIn',
    {
        "slots" : {},
        "utterances" : ["{Window Fan Air In| Fan Air Flow In| Air In }"]
    },
    function (req, res) {
        switch (air){
            case 1:
                res.say('Window Fan AirFlow In Already');
                console.log('Window Fan AirFlow In!');
                air = 1;
                break;
            case 2:
                res.say('Window Fan AirFlow In');
                console.log('Window Fan AirFlow In!');
                execCmd('WindowFan', 'Airflow', 2, function (res) {
                    console.log("Command Window Fan AirFlow executed with result : " + res);
                });
                air = 1;
                break;
            case 3:
                res.say('Window Fan AirFlow In');
                console.log('Window Fan AirFlow In!');
                execCmd('WindowFan', 'Airflow', 1, function (res) {
                    console.log("Command Window Fan AirFlow executed with result : " + res);
                });
                air = 1;
                break;
        }
    });

app.intent('WindowFanAirOut',
    {
        "slots" : {},
        "utterances" : ["{Window Fan Air Out| Fan Air Flow Out| Air Out }"]
    },
    function (req, res) {
        switch (air){
            case 1:
                res.say('Window Fan AirFlow Out');
                console.log('Window Fan AirFlow Out!');
                execCmd('WindowFan', 'Airflow', 1, function (res) {
                    console.log("Command Window Fan AirFlow executed with result : " + res);
                });
                air = 2;
                break;
            case 2:
                res.say('Window Fan AirFlow Out Already');
                console.log('Window Fan AirFlow In!');
                air = 2;
                break;
            case 3:
                res.say('Window Fan AirFlow Out');
                console.log('Window Fan AirFlow Out!');
                execCmd('WindowFan', 'Airflow', 2, function (res) {
                    console.log("Command Window Fan AirFlow executed with result : " + res);
                });
                air = 2;
                break;
        }
    });

app.intent('WindowFanAirExchange',
    {
        "slots" : {},
        "utterances" : ["{Window Fan Air Exchange| Fan Air Flow Exchange| Air Exchange }"]
    },
    function (req, res) {
        switch (air){
            case 1:
                res.say('Window Fan AirFlow Exchange');
                console.log('Window Fan AirFlow Exchange!');
                execCmd('WindowFan', 'Airflow', 2, function (res) {
                    console.log("Command Window Fan AirFlow executed with result : " + res);
                });
                air = 3;
                break;
            case 2:
                res.say('Window Fan AirFlow Exchange');
                console.log('Window Fan AirFlow Exchange!');
                execCmd('WindowFan', 'Airflow', 1, function (res) {
                    console.log("Command Window Fan AirFlow executed with result : " + res);
                });
                air = 3;
                break;
            case 3:
                res.say('Window Fan AirFlow Exchange Already');
                console.log('Window Fan AirFlow Exchange!');
                air = 3;
                break;
        }
    });

app.intent('IncreaseWindowFanTemp',
    {
        "slots" : {'AMOUNT' : 'NUMBER'},
        "utterances" : ["{increase|} Window Fan Temperature by {1-9|AMOUNT}"]
    },
    function (req, res) {
        var amt = parseInt(req.slot('AMOUNT'), 10);
        if (isNaN(amt)) {
            amt = 1;
        }
        if (amt > 10) {
            amt = 10;
        }
        res.say('Increasing Temperature by ' + amt);
        console.log('Increasing Temperature by ' + amt);
        execCmd('WindowFan', 'TempHotter', amt, function (res) {
            console.log("Command WindowFan Temperature increase was executed with result : " + res);
        });
    });

app.intent('DecreaseWindowFanTemp',
    {
        "slots" : {'AMOUNT' : 'NUMBER'},
        "utterances" : ["{decrease|} Window Fan Temperature {1-9|AMOUNT}"]
    },
    function (req, res) {
        var amt = parseInt(req.slot('AMOUNT'), 10);
        if (isNaN(amt)) {
            amt = 1;
        }
        if (amt > 10) {
            amt = 10;
        }
        res.say('decreasing Temperature by ' + amt);
        console.log('decreasing Temperature by ' + amt);
        execCmd('WindowFan', 'TempCooler', amt, function (res) {
            console.log("Command WindowFan Temperature decrease was executed with result : " + res);
        });
    });

/*
app.intent('TurnOff',
    {
        "slots" : {},
        "utterances" : ["{shutdown|good night|power everything off|power off everything|turn everything off|turn off everything|shut down}"]
    },
    function (req, res) {
        res.say('Turning off everything!');
        console.log('Turning off everythign!');
        execActivity('PowerOff', function (res) {
            console.log("Command to PowerOff executed with result : " + res);
        });
    });


app.intent('Movie',
    {
        "slots" : {},
        "utterances" : ["{movie|start movie|watch movie}"]
    },
    function (req, res) {
        res.say('Turning on Movie Mode!');
        console.log('Turning on Movie Mode!');
        execActivity('Watch a Movie', function (res) {
            console.log("Command to Watch a Movie executed with result : " + res);
        });
    });

*/

/**
 * Creates an intent function for a specific channel configuration
 * 
 * @param {object} channel - The channel configuration to create the function for
 * @returns {function} The channel intent function
 */
function getChannelFunction(channel) {
   return function (req, res) {
      res.say('Starting to ' + channel.utterance_name + '!');
      console.log('Starting to ' + channel.utterance_name + '!');
      var cmd = [], channel_chars = channel.channel.split(""), j;
      for (j = 0; j < channel_chars.length; j++) { 
         cmd[j] = 'NumericBasic,' + channel_chars[j];
      }
      execActivityCmd(channel.activity, cmd, 1);
   }
}

if (conf.channels) {
   // Iterate through the configured channels and create intents for them
   var channel_index;
   for (channel_index = 0; channel_index < conf.channels.length; channel_index++) {
      var channel = conf.channels[channel_index];
      // Build an intent name
      var intent = channel.activity.replace(" ", "");
      intent = intent.charAt(0).toUpperCase() + intent.slice(1);
      var utterance = channel.utterance_name.replace(" ", "");
      utterance = utterance.charAt(0).toUpperCase() + utterance.slice(1);
      intent = intent + utterance;
      app.intent(intent,
            {
                "slots" : {},
                "utterances" : ["{to|} " + channel.utterance_name]
            },
            getChannelFunction(channel));
      console.log('Added intent ' + intent + 
            ' with utterance ' + channel.utterance_name + 
            ' which triggers channel ' + channel.channel );
   }
}

module.exports = app;
