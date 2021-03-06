///                            ///
///        DEPENDENCIES        ///
///                            ///

// EXPRESS
const express = require("express");
const router = express.Router();

// SCRAPING
const axios = require("axios");
const cheerio = require("cheerio");

// MOMENT
const moment = require("moment");

// TEMP
const fs = require("fs");

// MODELS
const db = require("../models");


///                            ///
///           ROUTES           ///
///                            ///

// ** ROUTE FOR SCRAPING ** //
router.get("/scrape", function (req, res) {

    // AREA 51 - TESTING IN PROGRESS
    // AEG Events Group
    var promises = [
        axios.get("https://www.ogdentheatre.com/events"),
        axios.get("https://www.bluebirdtheater.net/events"),
        axios.get("https://www.gothictheatre.com/events"),
        axios.get("https://www.1stbankcenter.com/events"),
        axios.get("https://www.fiddlersgreenamp.com/events")
    ];

    Promise.all(promises)
        .then(function (scrapedResponses) {
            scrapedResponses.forEach(function(values) {
                // Load the response into cheerio and store it as a short-hand selector
                var $ = cheerio.load(values.data);

                var x = values.data;
                
                // Pull location once, before each loop
                var locationTextSearch = x.indexOf('<meta name="author" content="');
                var locationText = x.substring(locationTextSearch, locationTextSearch + 200)
                locationText = locationText.replace('<meta name="author" content="', "");
                var locationTextEnd = locationText.indexOf('"');
                var location = locationText.substring(0, locationTextEnd);
                
                // Save the desired information from the site
                $(".entry").each(function (i, element) {

                    // Create an empty object to store our data
                    var result = {};

                    // Pull the desired information
                    // Artist
                    result.artist = $(this).find(".info").children(".title").children(".carousel_item_title_small").text().trim();
                    // Date
                    result.date = $(this).find(".info").children(".date-time-container").children(".date").text().trim();
                    // Location
                    result.venue = location;
                    // Time
                    result.time = $(this).find(".info").children(".date-time-container").children(".time").text().replace("Show", "").trim();
                    // Time and Date
                    result.momentjsstamp = moment(result.date + " " + result.time, "ddd, MMM D, YYYY h:mm a").format();
                    // Event Link
                    result.eventlink = $(this).find(".thumb").children("a").attr("href");
                    // Image thumbnail
                    result.imgthumb = $(this).find(".thumb").children("a").children("img").attr("src");
                    // Ticket Status
                    result.ticketstatus = $(this).find(".buttons").children("a").attr("title");
                    // Support Act
                    var supportact = $(this).find(".info").children(".title").children("h4").text().trim();
                    if (supportact.startsWith("with ")) {
                        supportact = supportact.replace("with special guests: ", "");
                        supportact = supportact.replace("with special guest: ", "");
                        supportact = supportact.replace("with special guests ", "");
                        supportact = supportact.replace("with special guest ", "");
                        supportact = supportact.replace("with ", "");
                    }
                    result.supportact = supportact;

                    // Check if event already exists, if not then create new document
                    db.Events
                        .findOne({$and: [
                            {artist: result.artist},
                            {momentjsstamp: result.momentjsstamp},
                            {eventlink: result.eventlink}
                        ]}, {limit: 1})
                        .then(function (foundID) {
                            if (foundID) {
                                console.log("Event already exists")
                            } else {
                                console.log("Event doesn't exist yet - adding!")
                                // Create result in database
                                db.Events.create(result)
                                    .then(function () {})
                                    .catch(function (error) {
                                        return res.json(error);
                                    });
                            }

                        // Delete any events that are dated before today (0) or three days ahead (3)
                        var midnightTonight = moment().startOf("day").add(0, "days").format();
                        db.Events.find({momentjsstamp: {$lt: midnightTonight}}, null, {sort: {artist: 1}})
                            .then(function (eventsData) {
                                for (i = 0; i < eventsData.length; i++) {
                                    console.log("artist concert deleted " + eventsData[i].artist);
                                }
                            });
                        db.Events.deleteMany({momentjsstamp: {$lt: midnightTonight}}, function (i, err) {
                            if (err) {
                                console.log(err);
                            }   
                        });

                        console.log("ENTIRE PROCESS COMPLETED???")
                    });
                });
            })

    });

});

    // AREA 51 - TESTING IN PROGRESS

// ** ROUTES TO SEND TO SERVER.JS ** //

// Get all saved events from DB
router.get("/", function (req, res) {
    db.Events.find({}, null, {
            sort: {
                "momentjsstamp": 1
            }
        })
        .then(function (eventsData) {
            // Save all data into handlebars object
            var hbsObject = {
                events: eventsData
            };
            // console.log(hbsObject);
            res.render("index", hbsObject);
        })
        .catch(function (error) {
            res.json(error);
        });
});

// Get help
router.get("/help", function (req, res) {
    res.render("help");
});

// Save an event as going
router.put("/saved-going/:id", function (req, res) {
    db.Events.find({
            _id: req.params.id
        })
        .then(function (eventData) {
            if (eventData[0].rsvp.going == false) {
                db.Events.update({
                        _id: req.params.id
                    }, {
                        $set: {
                            saved: true,
                            "rsvp.dismissed": false,
                            "rsvp.interested": false,
                            "rsvp.going": true
                        }
                    })
                    .then(function (result) {
                        res.json(result);
                    })
                    .catch(function (error) {
                        res.json(error);
                    });
            } else {
                db.Events.update({
                        _id: req.params.id
                    }, {
                        $set: {
                            saved: true,
                            "rsvp.interested": true,
                            "rsvp.going": false
                        }
                    })
                    .then(function (result) {
                        res.json(result);
                    })
                    .catch(function (error) {
                        res.json(error);
                    });
            }
        })
        .catch(function (error) {
            res.json(error);
        });

});

// Save an event as interested
router.put("/saved-interested/:id", function (req, res) {
    db.Events.find({
            _id: req.params.id
        })
        .then(function (eventData) {
            // console.log(eventData[0].rsvp.interested)
            if (eventData[0].rsvp.interested == false) {
                db.Events.update({
                        _id: req.params.id
                    }, {
                        $set: {
                            saved: true,
                            "rsvp.dismissed": false,
                            "rsvp.interested": true,
                            "rsvp.going": false
                        }
                    })
                    .then(function (result) {
                        res.json(result);
                    })
                    .catch(function (error) {
                        res.json(error);
                    });
            } else {
                db.Events.update({
                        _id: req.params.id
                    }, {
                        $set: {
                            saved: false,
                            "rsvp.interested": false
                        }
                    })
                    .then(function (result) {
                        res.json(result);
                    })
                    .catch(function (error) {
                        res.json(error);
                    });
            }
        })
        .catch(function (error) {
            res.json(error);
        });
});

// Save an event as not interested (i.e. rsvp is blank)
router.put("/saved-dismiss/:id", function (req, res) {
    db.Events.find({
            _id: req.params.id
        })
        .then(function (eventData) {
            // console.log(eventData[0].rsvp.dismissed)
            if (eventData[0].rsvp.dismissed == false) {
                db.Events.update({
                        _id: req.params.id
                    }, {
                        $set: {
                            saved: true,
                            "rsvp.dismissed": true,
                            "rsvp.interested": false,
                            "rsvp.going": false
                        }
                    })
                    .then(function (result) {
                        res.json(result);
                    })
                    .catch(function (error) {
                        res.json(error);
                    });
            } else {
                db.Events.update({
                        _id: req.params.id
                    }, {
                        $set: {
                            saved: false,
                            "rsvp.dismissed": false
                        }
                    })
                    .then(function (result) {
                        res.json(result);
                    })
                    .catch(function (error) {
                        res.json(error);
                    });
            }
        })
        .catch(function (error) {
            res.json(error);
        });
});

// Reset
router.delete("/deleteall", function (req, res, next) {
    db.Events.remove({}, function (err) {
            if (err) {
                console.log(err);
            } else {
                console.log("Delete Function - Event history reset");
            }
        })
        .then(function () {
            db.Notes.remove({}, function (err) {
                if (err) {
                    console.log(err);
                } else {
                    console.log("Delete Function - rsvp history reset");
                }
            })
        })
});

module.exports = router;