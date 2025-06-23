


sudo mongod --dbpath ~/data/db


# need to change
- for individual approval, we need to save in splitwise then in the mongodb just like in the batch in the approve-update api
- when someone changes split in the ui of splitwise, we also need to update the mongodb which we cannot do. so maybe at some time when someone logins or when admin clicks a button for now, we need to check the splits in mongodb with the splits in the ui and then change the splits properly
