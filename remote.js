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

app.intent('MuteVolume',
    {
        "slots" : {},
        "utterances" : ["{mute|quiet|shut up|unmute}"]
    },
    function (req, res) {
        res.say('Muting!');
        console.log('Muting!');
        execCmdCurrentActivity('Volume,Mute', 1, function (res) {
            console.log("Command Mute executed with result : " + res);
        });
    });

app.intent('IncreaseTVVolume',
    {
        "slots" : {'AMOUNT' : 'NUMBER'},
        "utterances" : ["{increase|} TV volume by {1-9|AMOUNT}"]
    },
    function (req, res) {
        var amt = parseInt(req.slot('AMOUNT'), 10);
        if (isNaN(amt)) {
            amt = 1;
        }
        res.say('Increasing TV volume by ' + amt);
        console.log('Increasing volume by ' + amt);
        execCmd('TV', 'VolumeUp', amt, function (res) {
            console.log("Command Volume UP was executed with result : " + res);
        });
    });

app.intent('DecreaseTVVolume',
    {
        "slots" : {'AMOUNT' : 'NUMBER'},
        "utterances" : ["{decrease TV volume|reduce TV volume} by {1-9|AMOUNT}"]
    },
    function (req, res) {
        var amt = parseInt(req.slot('AMOUNT'), 10);
        if (isNaN(amt)) {
            amt = 1;
        }
        res.say('Decreasing TV volume by ' + amt);
        console.log('Decreasing volume by ' + amt);
        execCmd('TV', 'VolumeDown', amt, function (res) {
            console.log("Command Volume Down was executed with result : " + res);
        });
    });

app.intent('MuteTVVolume',
    {
        "slots" : {},
        "utterances" : ["{mute|unmute} {TV|telivision}"]
    },
    function (req, res) {
        res.say('Muting TV!');
        console.log('Muting!');
        execCmd('TV', 'Mute', 1, function (res) {
            console.log("Command Mute executed with result : " + res);
        });
    });


app.intent('TurnOffTV',
    {
        "slots" : {},
        "utterances" : ["{turn the TV off|turn TV off}"]
    },
    function (req, res) {
        res.say('Turning TV off!');
        console.log('Turning TV off!');
        execCmd('TV', 'PowerOff', 1, function (res) {
            console.log("Command TV PowerOff executed with result : " + res);
        });
    });

app.intent('TurnOnTV',
    {
        "slots" : {},
        "utterances" : ["{turn on the TV|turn the TV on|turn on TV|turn TV on}"]
    },
    function (req, res) {
        res.say('Turning TV on!');
        console.log('Turning TV on!');
        execCmd('TV', 'PowerOn', 1, function (res) {
            console.log("Command TV PowerOn executed with result : " + res);
        });
    });

app.intent('SelectPlaystation',
    {
        "slots" : {},
        "utterances" : ["{select|} {playstation}"]
    },
    function (req, res) {
        res.say('Selecting ps4!');
        console.log('Selecting ps4!');
        execCmd('TV', 'InputHdmi1', 1, function (res) {
            console.log("Command TV InputHdmi1 executed with result : " + res);
        });
    });

// Sony Reciver

app.intent('SpeakerOn',
    {
        "slots" : {},
        "utterances" : ["{Speaker|start Speaker|Speaker on| turn speaker on}"]
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
        "utterances" : ["{Speaker|Turn off Speaker|Speaker off| shut down Speaker}"]
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
        "utterances" : ["{speaker input one| give me speaker input one }"]
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
        "utterances" : ["{speaker input two| give me speaker input two }"]
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
        "utterances" : ["{Window Fan on|turn on Window Fan|Window Fan off |Change Window Fan speed | Window Fan speed }"]
    },
    function (req, res) {
        res.say('Window Fan Speed changed');
        console.log('Window Fan Mode Speed!');
        execCmd('WindowFan', 'Power', 1, function (res) {
            console.log("Command Window Fan Speed executed with result : " + res);
        });
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

/////
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



app.intent('Music',
    {
        "slots" : {},
        "utterances" : ["{music|start music}"]
    },
    function (req, res) {
        res.say('Turning on Music Mode!');
        console.log('Turning on Music Mode!');
        execActivity('Listen to Digital Music', function (res) {
            console.log("Command to Music executed with result : " + res);
        });
    });

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
